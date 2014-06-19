    // Node modules
var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io')
    , aabb = require('aabb-2d')
    , git = require('git-rev')
    // Native/local modules
    , math = require('./math')
    , utils = require('./utils')
    , shottypes = require('./shottypes');

var gameSizeX = 1280;
var gameSizeY = 720;
var nameSizeLimit = 256;
var runningBehindProxy = false;

// time limits, in seconds
var imageChangeCooldown = 30;
var roundTimeLimit = 5 * 60;

// how long bots should wait after being hit, randomly chosen between these numbers
var botWaitLimitLower = 1.5;
var botWaitLimitUpper = 4;

// imgur ids to default backgrounds
// bg is chosen at random when someone joins an empty room
// some are nsfw, but its your own fault for playing a game at work where people can change the background to any picture
var defaultBackgrounds = [
    // Weeb backgrounds
    'ZlfgFEd',
    '4md05F3',
    'na9C9v2',
    'PTRI2c3',
    'eTrf88K',
    'u6n9Ua5',
    'mOjgJNz',

    // #lewd backgrounds
    'u6n9Ua5',
    'k1ZYP',

    'YC1sfXU', // RMS
    'Af4V2dw', // XP bliss
    'DvKUZe6', // watermelon cat
    'IXhb7gm',
    'Mo76aW2',
    'c4LI12K',
    'aVU460l',
    '7IiT5Dr',
    'HdiU8si',
    'QnknX9f',
    'qa10MHM',
    'StDQX9J',
    'a9QLCAQ',
    'MwmvF7q',
    'I3vmKcd',
    'Slvh7PP', // RMS
    'fWK2UYH',
    'DRBZ2ID', // carlton
    'LBjffOX',

    // Nintendrone backgrounds
    'Z99cY9Z',
    'FCDClZv',
    'kozAact',
    '1gNWCfp',
    'grbfGDF',
    'HVNO2oU',
    'KcRYzaS',
    'wD1e0xu',
    'SR3GwrL',
    'KNgH4Z1',
    'y7OgpcR',
    'K6FPsql'
];
var serverVersion = "unknown";
git.short(function(str)
{
    var ver = str;
    if(ver === undefined || ver === '')
        ver = "unknown";
    serverVersion = ver;
    console.log('running openhotel version ' + ver);
});

var players = [];
var rooms = [];
var bots = [];
var bullets = [];
var bulletId = 0;

var sessionID = math.randomInt(0, 65535);

var speedPlayer = 1.25; // speed multiplier, speed is 0.5 * this
var speedMonster = 1.25;
var speedBullet = 2.0;

var gameStart = [];
var infectStart = [];
var infectEnd = [];

var lastImage = [];
var lastImageChange = [];
var lastImageUserChange = [];

var currentTime = [];

var indexdata = fs.readFileSync(__dirname + '/index.html');
var sourcedata = fs.readFileSync(__dirname + '/app.js');
var listeningport = Number((runningBehindProxy && process.env.PORT) || 8080);

var serverPassword = "default";
if(fs.existsSync(__dirname + '/password.txt'))
    serverPassword = fs.readFileSync(__dirname + '/password.txt', 'utf8'); // todo: use hashes

serverPassword = serverPassword.replace(/^\s+|\s+$/g, '');

console.log('server password:', serverPassword);

var server = http.createServer(function(req, res) {
    if(req.url === '/devindex.html')
    {
        res.writeHead(200, { 'Content-type': 'text/html'});
        res.end(fs.readFileSync(__dirname + '/index.html'));
    }
    else if(req.url === '/style.css')
    {
        res.writeHead(200, { 'Content-type': 'text/css'});
        res.end(fs.readFileSync(__dirname + '/style.css'));
    }
    else if(req.url !== '/app.js')
    {
        res.writeHead(200, { 'Content-type': 'text/html'});
        res.end(indexdata);
    }
    else
    {
        res.writeHead(200, { 'Content-type': 'application/javascript'});
        res.end(sourcedata);
    }
    console.log('conn to ' + req.url);
}).listen(listeningport, function() {
    console.log('Listening at: http://localhost:' + listeningport);
});

var io = socketio.listen(server);

function addPlayer(pid, ip, room, username, x, y, monster, iosocket)
{
    var player = {
        id: pid, 
        ip: ip, 
        room: room, 
        username: username, 
        x: x, 
        y: y, 
        newX: x, 
        newY: y, 
        monster: monster, 
        lastNameChange: 0, 
        firstFire: 0, 
        fireCount: 0, 
        connected: true,
        moveRight: false,
        moveLeft: false,
        moveUp: false,
        moveDown: false,
        iosock: iosocket
    };
    
    players.push(player);
    
    return player;
}

function getPlayerUpdate(player)
{
    if(player !== undefined)
        return {id: player.id, username: player.username, x: player.newX, y: player.newY, monster: player.monster, connected: player.connected, moveRight: player.moveRight, moveLeft: player.moveLeft, moveUp: player.moveUp, moveDown: player.moveDown};
    return undefined;
}

function getPlayerUpdateAbsolute(player)
{
    if(player !== undefined)
        return {id: player.id, username: player.username, x: player.x, y: player.y, monster: player.monster, connected: player.connected};
    return undefined;
}

function getConnCount(room)
{
    var count = 0;
    for(p = 0; p < players.length; p++)
    {
        if(!players[p].connected || players[p].room !== room)
            continue;
        count++;
    }
    return count;
}

function getMonsterCount(room)
{
    var count = 0;
    for(p = 0; p < players.length; p++)
    {
        if(!players[p].connected || !players[p].monster || players[p].room !== room)
            continue;
        count++;
    }
    return count;
}

function getIdxForID(playerid)
{
    for(p = 0; p < players.length; p++)
    {
        if(players[p].id !== playerid)
            continue;
        return p;
    }
    return -1;
}

function getPlayerForSocket(socket)
{
    for(p = 0; p < players.length; p++)
    {
        if(players[p].iosock !== socket) continue;
        return players[p];
    }
    return undefined;
}

function getBotForPlayer(player)
{
    if(player.iosock !== undefined) return false;
    for(b=0; b<bots.length; b++)
    {
        if(players[bots[b].playeridx].id === player.id)
            return bots[b];
    }
    return false;
}

function getConnectedHumans(room)
{
    var valid = [];
    for(p = 0; p < players.length; p++)
    {
        if(!players[p].connected || players[p].monster || players[p].room !== room)
            continue;
        valid.push(players[p]);
    }
    return valid;
}

function infectRandomPlayer(room)
{
    if(players.length <= 0 || getConnCount(room) <= 0)
        return;

    var valid = getConnectedHumans(room);
    if(valid.length <= 0)
        return;

    var infectid = math.randomInt(0, valid.length);

    valid[infectid].monster = true;
    console.log('infecting player ' + infectid);
    console.log('conns: ' + getConnCount(room) + ' monsters: ' + getMonsterCount(room));

    var upd = getPlayerUpdate(valid[infectid]);
    if(upd !== undefined)
        io.sockets.in(room).emit("updatePlayer", upd);
}

function getBotsForRoom(room)
{
    var roombots = [];
    for(b=0; b<bots.length; b++)
    {
        if(players[bots[b].playeridx].room !== room) continue;

        roombots.push(bots[b]);
    }
    return roombots;
}

function getDistanceBetweenPlayers(player1, player2)
{
    var xd = player1.x-player2.x;
    var yd = player1.y-player2.y;
    return Math.abs(Math.sqrt(xd*xd + yd*yd));
}
function getClosestPlayerIdx(player, type)
{
    var targetdistance = 9999999999;
    var targetidx = -1;
    if(type !== 'human' && type !== 'monster')
        return targetidx;

    for(p=0; p<players.length; p++)
    {
        if((type === 'human' && players[p].monster) || (type === 'monster' && !players[p].monster) || players[p].room !== player.room || !players[p].connected)
            continue;
        var dist = getDistanceBetweenPlayers(player, players[p]);
        if(targetdistance > dist)
        {
            targetidx = p;
            targetdistance = dist;
           // console.log('bot ' + player.id + ' chose player ' + players[targetidx].id, players[targetidx].username);
        }
    }
    return targetidx;
}
function botRetarget(bot)
{
    var player = players[bot.playeridx];
// lets choose a target
    var targetidx = getClosestPlayerIdx(player, 'human');
    var randX = player.newX;
    var randY = player.newY;
    if(targetidx >= 0)
    {
        var targetplayer = players[targetidx];
        randX = targetplayer.x;
        randY = targetplayer.y;
    }
    else
    {
        if(randX == player.x && randY == player.y)
        {
            randX = math.randomInt(0, Math.floor(gameSizeX / 10)) * 10;
            randY = math.randomInt(0, Math.floor(gameSizeY / 10)) * 10;
        }
    }
    bot.targetidx = targetidx;
    if(randX != player.newX || randY != player.newY)
    {
        player.newX = randX;
        player.newY = randY;
        var upd = getPlayerUpdate(player);
        if(upd !== undefined)
            io.sockets.in(player.room).emit('updatePlayer', upd);
    }
    if(targetidx >= 0)
        bot.status = 'attack';
}


function fireBullet(player, targetX, targetY)
{
    var time = utils.getTime();
    if(player.firstFire === undefined || player.firstFire === 0)
        player.firstFire = time;
    else if(time - player.firstFire >= 2)
    {
        player.firstFire = 0;
        player.fireCount = 0;
    }
    if(player.fireCount !== undefined && player.fireCount > 10)
        return;

    player.fireCount++;

    // To change which shot is being used, simply call a different shot function, eg tripleShot()
    // (you should even be able to provide the same arguments)
    var id = {id: bulletId};
    // Example of using the optional color arg to specify shot color
    // (internally, we don't even have to use this val for all bullets of the shot)
    var shot = shottypes.singleShot(player, {x: targetX, y: targetY}, id, {speedBullet: speedBullet, color: "#0000FF"});
    bulletId = id.id;

    for(i = 0; i < shot.length; i++)
    {
        // Push bullet into array, have it keep track of its own room and emit the bullet to room that spawned it
        //
        // At the moment every bullet gets a unique id from a basic incrementing counter, I don't think it'll overflow
        // but if it ever comes to it, we can just keep an array to store id values that can be recycled and reuse those
        bullets.push(shot[i]);
        io.sockets.in(player.room).emit('newBullet', shot[i]);
    }
}

function updateBots(room)
{
    var time = utils.getTime();
    var roombots = getBotsForRoom(room);
    if(roombots.length <= 0)
    {
        // spawn some bots
        console.log('spawning bots');
        for(b=0; b<10;b++)
        {
            var randX = math.randomInt(0, (gameSizeX / 10)) * 10;
            var randY = math.randomInt(0, (gameSizeY / 10)) * 10;
            var pid = players.length + 1;
            
            var botplayer = addPlayer(pid, "127.0.0.1", room, "", randX, randY, false, undefined);
            
            bots.push({playeridx: players.length - 1, targetidx: -1, status: 'think', timer: 0, lastType: 'human', bulletHit: false, lastShot: 0});
            
            io.sockets.in(room).emit('newPlayer', {id: pid, username: '', x: randX, y: randY, monster: false, connected: true});
            console.log('bot spawned, stats: ', botplayer, bots[bots.length - 1]);
        }
        roombots = getBotsForRoom(room);
    }

    for(b=0; b<roombots.length; b++)
    {
        var bot = roombots[b];
        var player = players[bot.playeridx];
        if(!player.monster || getMonsterCount(room) >= getConnCount(room))
        {
            bot.lastType = 'human';
            //if(bot.status === 'think')
            //{
                var curXtile = Math.ceil(player.x / 10);
                var curYtile = Math.ceil(player.y / 10);
                var destXtile = Math.ceil(player.newX / 10);
                var destYtile = Math.ceil(player.newY / 10);
                if((curXtile == destXtile || curXtile + 1 == destXtile || curXtile - 1 == destXtile) &&
                   (curYtile == destYtile || curYtile + 1 == destYtile || curYtile - 1 == destYtile) )
                {
                    // go somewhere random
                    var randX = math.randomInt(0, Math.floor(gameSizeX / 10)) * 10;
                    var randY = math.randomInt(0, Math.floor(gameSizeY / 10)) * 10;

                    player.newX = randX;
                    player.newY = randY;
                    var upd = getPlayerUpdate(player);
                    if(upd !== undefined)
                        io.sockets.in(room).emit('updatePlayer', upd);
                    //bot.status = 'attack';
                }
                //else
                //    console.log('bot thinking... ', player.id, curXtile, destXtile, curYtile, destYtile);
            //}
            var hrtime = utils.getHighResTime();
            if(!player.monster && (hrtime - bot.lastShot >= 300))
            {
                // fire a bullet at the closest monster
                var targetidx = getClosestPlayerIdx(player, 'monster');
                if(targetidx < 0)
                    continue;

                var target = players[targetidx];
                fireBullet(player, target.x, target.y);
                bot.lastShot = hrtime;
            }
        }
        else
        {
            if(bot.lastType === 'human')
            {
                if(bot.timer !== 0 && time - bot.timer >= math.randomInt(botWaitLimitLower, botWaitLimitUpper))
                {
                    bot.lastType = 'infected';
                    bot.timer = 0;
                }
                else
                {
                    if(bot.timer === 0)
                    {
                        bot.timer = time;
                        player.newX = player.x;
                        player.newY = player.y;
                        var upd = getPlayerUpdate(player);
                        if(upd !== undefined)
                            io.sockets.in(room).emit('updatePlayer', upd);
                    }

                    continue;
                }
            }
            if(bot.status === 'think')
            {
                botRetarget(bot);
            }
            else if(bot.status === 'attack' && bot.targetidx >= 0)
            {
                if(getClosestPlayerIdx(player, 'human') !== bot.targetidx)
                {
                    bot.status = 'think';
                    continue;
                }
                var targetplayer = players[bot.targetidx];
                if(!targetplayer.connected || targetplayer.monster)
                {
                    bot.status = 'think';
                    bot.targetidx = -1;
                    player.newX = player.x;
                    player.newY = player.y;
                    var upd = getPlayerUpdate(player);
                    if(upd !== undefined)
                        io.sockets.in(room).emit('updatePlayer', upd);
                    //console.log('bot ', bot, ' is going to sit and think');
                }
                else
                {
                    if(player.newX != targetplayer.x || player.newY != targetplayer.y)
                    {
                        if(bot.bulletHit && bot.timer === 0)
                            bot.timer = time;
                        else if(!bot.bulletHit || time - bot.timer >= math.randomInt(botWaitLimitLower, botWaitLimitUpper))
                        {
                            player.newX = targetplayer.x;
                            player.newY = targetplayer.y;
                            var upd = getPlayerUpdate(player);
                            if(upd !== undefined)
                                io.sockets.in(room).emit('updatePlayer', upd);
                            bot.timer = 0;
                            bot.bulletHit = false;
                        }
                    }
                }
            }
        }
    }
}
function updateWorld()
{
    for(r=0; r<rooms.length; r++)
    {
        var ct = currentTime[r];
        var newtime = utils.getHighResTime();
        var frametime = newtime - ct;
        currentTime[r] = newtime;

        var room = rooms[r];
        var connCount = getConnCount(room);
        var monsterCount = getMonsterCount(room);

        if(players.length <= 0 || connCount <= 0)
            return;

        var time = utils.getTime();

        if(time - lastImageChange[r] >= 60 && time - lastImageUserChange[r] >= (3 * 60))
        {
            lastImage[r] = "http://i.imgur.com/" + defaultBackgrounds[math.randomInt(0, defaultBackgrounds.length - 1)] + ".jpg";
            console.log('changing room ' + room + ' image to ' + lastImage[r]);
            var msg = {src: lastImage[r]};
            io.sockets.to(room).emit('updateImage', msg);
            lastImageChange[r] = time;
        }

        updateBots(room);

        // monsters win
        if(monsterCount >= connCount && infectEnd[r] <= 0)
        {
            infectEnd[r] = time;
            console.log('monsters win @ ' + time + ' room ' + room);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        }

        // humans win
        if(connCount > monsterCount && infectEnd[r] <= 0 && gameStart[r] > 0 && time - gameStart[r] >= roundTimeLimit)
        {
            infectEnd[r] = time;
            console.log('humans win @ ' + time + ' room ' + room);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
            io.sockets.in(room).emit("roundEnd", {id: 0, victimid: 0});
        }

        if(infectEnd[r] > 0 && (time - infectEnd[r]) >= 5)
        {
            for(p = 0; p < players.length; p++)
            {
                if(!players[p].connected || !players[p].monster || players[p].room !== room)
                    continue;
                players[p].monster = false;
                var upd = getPlayerUpdate(players[p]);
                if(upd !== undefined)
                    io.sockets.in(room).emit("updatePlayer", upd);
            }
            gameStart[r] = 0;
            infectStart[r] = 0;
            infectEnd[r] = 0;
            console.log('round reset @ ' + time + ' room ' + room);
            console.log('conns: ' + connCount + ' monsters: ' + getMonsterCount(room));
        }
        if(connCount >= 2 && gameStart[r] <= 0)
        {
            gameStart[r] = time;
            console.log('round start @ ' + time + ' room ' + room);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
            io.sockets.in(room).emit("roundStart", {timeLimit: roundTimeLimit});
        }
        if(connCount >= 2 && gameStart[r] > 0 && infectStart[r] <= 0 && (time - gameStart[r]) >= 15)
        {
            // we have 2 or more players and 30 seconds has passed
            // infect one of them randomly
            infectStart[r] = time;
            console.log('infect start @ ' + time + ' room ' + room);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);

            var toinfect = Math.ceil(connCount * 0.3);
            if(toinfect >= connCount)
                toinfect = connCount - 1;
            if(toinfect <= 0)
                toinfect = 1;


            console.log('infecting ' + toinfect + ' random players out of ' + connCount + ' players, room ' + room);

            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);

            for(y = 0; y < toinfect; y++)
                infectRandomPlayer(room);
        }

        for(p = 0; p < players.length; p++)
        {
            var player = players[p];
            if(!player.connected || player.room !== room) continue;

            var speed = (0.5 * speedPlayer) * (frametime / 10);

            if(player.x<player.newX || player.moveRight)
            {
                player.x+=speed;
                if(player.moveRight) { player.newX = player.x; player.newY = player.y; }
                if(player.x > player.newX) player.x = player.newX;
            }

            if(player.x>player.newX || player.moveLeft)
            {
                player.x-=speed;
                if(player.moveLeft) { player.newX = player.x; player.newY = player.y; }
                if(player.x < player.newX) player.x = player.newX;
            }

            if(player.y<player.newY || player.moveDown)
            {
                player.y+=speed;
                if(player.moveDown) { player.newX = player.x; player.newY = player.y; }
                if(player.y > player.newY) player.y = player.newY;
            }

            if(player.y>player.newY || player.moveUp)
            {
                player.y-=speed;
                if(player.moveUp) { player.newX = player.x; player.newY = player.y; }
                if(player.y < player.newY) player.y = player.newY;
            }
            
            if(player.x < 0) player.x = 0;
            if(player.y < 0) player.y = 0;
            if(player.x >= (gameSizeX - 10)) player.x = gameSizeX - 10;
            if(player.y >= (gameSizeY - 10)) player.y = gameSizeY - 10;
        }
    }
    updateZombies();
    updateBullets(frametime);
}
function updateZombies()
{
    for(p = 0; p < players.length; p++)
    {
        var player = players[p];
        if(!player.monster || !player.connected) continue;

        var zombie_box = aabb([player.x - 10, player.y - 10], [30, 30]);

        for(py = 0; py < players.length; py++)
        {
            if(players[py].monster || players[py].id == player.id || players[py].room !== player.room)
                continue;

            var player_box = aabb([players[py].x, players[py].y], [10, 10]);
            
            if(zombie_box.intersects(player_box))
            {
                players[py].monster = true;
                var upd = getPlayerUpdate(players[py]);
                console.log('player ' + player.id + ' infected player ' + players[py].id);
                console.log('conns: ' + getConnCount(player.room) + ' monsters: ' + getMonsterCount(player.room));
                if(upd !== undefined)
                {
                    upd.attackerid = player.id;
                    io.sockets.to(player.room).emit("updatePlayer", upd);
                }
                if(getMonsterCount(player.room) >= getConnCount(player.room) && infectEnd[rooms.indexOf(player.room)] <= 0)
                    io.sockets.in(player.room).emit("roundEnd", {id: player.id, victimid: upd.id});
            }
        }
    }
}
function updateBullets(frametime)
{
    // update bullets
    for(i = 0; i < bullets.length; i++)
    {
        if(!bullets[i].alive)
            continue;

        bullets[i].x += (bullets[i].velocity[0] * (frametime / 10));
        bullets[i].y += (bullets[i].velocity[1] * (frametime / 10));

        // kill bullet if it is outside of canvas
        if(bullets[i].x > gameSizeX || bullets[i].x < 0 || bullets[i].y > gameSizeY || bullets[i].y < 0)
        {
            bullets[i].alive = false;
            io.sockets.in(bullets[i].room).emit("updateBullet", {id: bullets[i].id, x: bullets[i].x, y: bullets[i].y, alive: bullets[i].alive});
        }

        if(!bullets[i].alive)
        {
            bullets.splice(i, 1);
            continue;
        }

        var idx = getIdxForID(bullets[i].playerId);
        if(idx >= 0 && players.length > idx && !players[idx].monster)
        {
            var bullet_box = aabb([bullets[i].x, bullets[i].y], [5, 5]);
            for(p = 0; p < players.length; p++)
            {
                var player = players[p];
                if(player.id === bullets[i].playerId || !player.monster || !player.connected) continue;
                var player_box = aabb([player.x - 10, player.y - 10], [30, 30]);
                if(bullet_box.intersects(player_box))
                {
                    //console.log('player hit ' + player.id);
                    // player hit!
                    player.newX = player.x + (bullets[i].velocity[0] * 100);
                    player.newY = player.y + (bullets[i].velocity[1] * 100);

                    if(player.newX < 0) player.newX = 0;
                    if(player.newY < 0) player.newY = 0;
                    if(player.newX >= gameSizeX) player.newX = gameSizeX - 10;
                    if(player.newY >= gameSizeY) player.newY = gameSizeY - 10;

                    player.moveRight = player.moveLeft = player.moveUp = player.moveDown = false;
                    
                    if(player.iosock === undefined) // it's a bot
                    {
                        var bot = getBotForPlayer(player);
                        bot.bulletHit = true;
                    }

                    var upd = getPlayerUpdate(player);
                    if(upd !== undefined)
                    {
                        upd.attackerid = player.id;
                        io.sockets.emit("updatePlayer", upd);
                    }
                    bullets[i].alive = false;
                    io.sockets.in(bullets[i].room).emit("updateBullet", {id: bullets[i].id, x: bullets[i].x, y: bullets[i].y, alive: bullets[i].alive});
                    break;
                }
            }
        }

        if(!bullets[i].alive)
        {
            bullets.splice(i, 1);
            continue;
        }
    }
}

setInterval(updateWorld,10);
//setInterval(updateBullets, 10);

io.on('connection', function (socket)
{
    var remoteAddress = (runningBehindProxy && socket.handshake.headers['x-forwarded-for']) || socket.request.connection.remoteAddress;

    socket.on('joinRoom', function (msg)
    {
        var player = getPlayerForSocket(socket);
        if(msg.room !== 'public') return;
        if(!(rooms.indexOf(msg.room) > -1))
        {
            rooms.push(msg.room);
            gameStart.push(0);
            infectStart.push(0);
            infectEnd.push(0);
            lastImageChange.push(utils.getTime());
            lastImageUserChange.push(0);
            currentTime.push(utils.getHighResTime());
            var imgurid = defaultBackgrounds[math.randomInt(0, defaultBackgrounds.length - 1)];
            lastImage.push("http://i.imgur.com/" + imgurid + ".jpg");
        }
        if(player === undefined || (player !== undefined && player.room !== msg.room))
        {
            if(player !== undefined)
            {
                socket.leave(player.room);
                socket.join(msg.room);
                player.room = msg.room;
            }
            else
            {
                socket.join(msg.room);

                var pid = players.length + 1;
                console.log('new player at ID ' + pid + ', IP ' + remoteAddress + ', room ' + msg.room);

                var randX = math.randomInt(0, (gameSizeX / 10)) * 10;
                var randY = math.randomInt(0, (gameSizeY / 10)) * 10;

                var monst = infectStart[rooms.indexOf(msg.room)] > 0;
                addPlayer(pid, remoteAddress, msg.room, '', randX, randY, monst, socket);
                
                var timeleft = roundTimeLimit - (utils.getTime() - gameStart[rooms.indexOf(msg.room)]);
                if(timeleft < 0)
                    timeleft = 0;
                if(timeleft > roundTimeLimit)
                    timeleft = roundTimeLimit;

                socket.emit('gameState', {id: pid, session: sessionID, serverVersion: serverVersion, timeLeft: timeleft, x: gameSizeX, y: gameSizeY, speedPlayer: speedPlayer, speedMonster: speedMonster, image: lastImage[rooms.indexOf(msg.room)]});
                socket.broadcast.to(msg.room).emit('newPlayer', {id: pid, username: '', x: randX, y: randY, monster: monst, connected: true});

                console.log('conns: ' + getConnCount(msg.room) + ' monsters: ' + getMonsterCount(msg.room));
            }
        }
        // send player list to client
        for(p = 0; p < players.length; p++)
        {
            if(players[p].room !== msg.room) continue;
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
            {
                upd.x = players[p].x;
                upd.y = players[p].y;
                upd.absolute = true;
                socket.emit('newPlayer', upd);
                upd.x = players[p].newX;
                upd.y = players[p].newY;
                socket.emit('updatePlayer', upd);
            }
        }
        socket.emit('endPlayerList', true);
    });

    // some stuff copied from socket.on('position') and socket.on('joinRoom')
    socket.on('fireBullet', function (msg)
    {
        //console.log('Bullet fired by Player: ' + msg.id);
        if(msg.session !== sessionID || msg.id > players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }

        if(msg.x >= gameSizeX || msg.y >= gameSizeY)
            return;

        // Search through the players array for the player that fired the bullet
        var time = utils.getTime();
        for(p = 0; p < players.length; p++)
        {
            if(players[p].id !== msg.id)
                continue;
            if(players[p].ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + players[p].ip);
                break;
            }

            fireBullet(players[p], msg.x, msg.y);

            break;
        }
    });
    socket.on('movement', function(msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== sessionID || msg.id > players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        
        for(p = 0; p < players.length; p++)
        {
            var player = players[p];
            if(player.id !== msg.id)
                continue;
            if(player.ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + player.ip);
                break;
            }
            
            player.moveRight = msg.moveRight;
            player.moveLeft = msg.moveLeft;
            player.moveUp = msg.moveUp;
            player.moveDown = msg.moveDown;
                
            var upd = getPlayerUpdate(player);
            if(upd !== undefined)
            {
                socket.broadcast.to(player.room).emit('updatePlayer', upd);
                socket.emit('updatePlayer', upd);
            }
            
            break;
        }
    });
    socket.on('position', function (msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== sessionID || msg.id > players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }

        // if position is out of bounds
        if(msg.x >= gameSizeX || msg.y >= gameSizeY)
            return;

        for(p = 0; p < players.length; p++)
        {
            if(players[p].id !== msg.id)
                continue;
            if(players[p].ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + players[p].ip);
                break;
            }

            players[p].newX = msg.x;
            players[p].newY = msg.y;
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
            {
                socket.broadcast.to(players[p].room).emit('updatePlayer', upd);
                socket.emit('updatePlayer', upd);
            }
            break;
        }
    });

    socket.on('updateImage', function(msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== sessionID || msg.id > players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        var player = getPlayerForSocket(socket);
        if(player === undefined) return;

        var time = utils.getTime();
        var roomidx = rooms.indexOf(player.room);
        var validImage = (time - lastImageUserChange[roomidx] >= imageChangeCooldown);

        if((validImage || remoteAddress == "127.0.0.1" || remoteAddress == "localhost") && msg.src.length > 5 && (msg.src.substring(0, 5) === "http:" || msg.src.substring(0, 5) === "data:"))
        {
            socket.broadcast.to(player.room).emit('updateImage', msg);
            socket.emit('updateImage', msg);
            lastImageUserChange[roomidx] = time;
            lastImage[roomidx] = msg.src;
            console.log('image changed by player ' + msg.id + ' to ' + msg.src);
        }
    });

    socket.on('username', function(msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== sessionID || msg.id > players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        if(msg.username === undefined) return;
        var time = utils.getTime();
        var name = msg.username;
        if(name.length > nameSizeLimit)
            name = name.substring(0, nameSizeLimit);

        for(p = 0; p < players.length; p++)
        {
            if(players[p].id !== msg.id)
                continue;
            if(players[p].ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + players[p].ip);
                break;
            }
            if(players[p].lastNameChange == 0 || time - players[p].lastNameChange >= 30)
            {
                players[p].lastNameChange = time;
            }
            //else
            //    break;
            players[p].username = name;
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
            {
                console.log('updating player ' + players[p].id + ' username to ' + players[p].username);
                socket.broadcast.to(players[p].room).emit('updatePlayer', upd);
                socket.emit('updatePlayer', upd);
            }
            break;
        }
    });

    socket.on('changeSettings', function(msg)
    {
        if(serverPassword === "default")
        {
            console.log('no password.txt file found, disallowing admin command!');
            return;
        }
        if(msg.password === undefined || msg.password !== serverPassword)
        {
            console.log('attempted hack into admin command, ip: ' + remoteAddress);
            return;
        }
        if(msg.x !== undefined)
            gameSizeX = msg.x;
        if(msg.y !== undefined)
            gameSizeY = msg.y;
        if(msg.speedPlayer !== undefined)
            speedPlayer = msg.speedPlayer;
        if(msg.speedMonster !== undefined)
            speedMonster = msg.speedMonster;
        if(msg.speedBullet !== undefined)
            speedBullet = msg.speedBullet;
        if(msg.botLower !== undefined)
            botWaitLimitLower = msg.botLower;
        if(msg.botUpper !== undefined)
            botWaitLimitUpper = msg.botUpper;
        for(p = 0; p < players.length; p++)
        {
            var player = players[p];
            if(!player.connected || player.iosock === undefined) continue;
            player.iosock.emit('gameState', {id: player.id, session: sessionID, x: gameSizeX, y: gameSizeY, speedPlayer: speedPlayer, speedMonster: speedMonster, image: lastImage[rooms.indexOf(player.room)]});
            // todo: fix this, it should move out of bound players back into the game for when the game is resized
            /*var updated = false;
            if(player.x >= gameSizeX)
            {
                player.x = gameSizeX - 20;
                updated = true;
            }
            if(player.y >= gameSizeY)
            {
                player.y = gameSizeY - 20;
                updated = true;
            }
            if(updated)
            {
                var upd = getPlayerUpdate(player);
                if(upd !== undefined)
                {
                    socket.broadcast.emit('updatePlayer', upd);
                    socket.emit('updatePlayer', upd);
                }
            }*/
        }
    });

    socket.on('disconnect', function()
    {
        for(p = 0; p < players.length; p++)
        {
            if(players[p].iosock !== socket)
                continue;
            players[p].connected = false;
            var player = players[p];
            var upd = getPlayerUpdate(player);
            //connCount--;
            //if(players[p].monster === 1)
            //    monsterCount--;
            console.log('player ' + player.id + ' disconnected');
            console.log('conns: ' + getConnCount(player.room) + ' monsters: ' + getMonsterCount(player.room));

            if(upd !== undefined)
            {
                socket.broadcast.to(player.room).emit('updatePlayer', upd);
                console.log('sent disconnected player update');
            }
            break;
        }
    });
}); 