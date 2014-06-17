var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io')
    , aabb = require('aabb-2d')
    , tripcode = require('tripcode');

function randomInt (low, high)
{
    return Math.floor(Math.random() * (high - low) + low);
}

function vectorLength(x, y)
{
    return Math.sqrt(x*x + y*y);
}

function normalize(x, y)
{
    var len = vectorLength(x, y);
    if (len > 0) {
        return [x/len, y/len];
    } else {
        return [x, y]
    }
}


var indexdata = fs.readFileSync(__dirname + '/index.html');
var sourcedata = fs.readFileSync(__dirname + '/app.js');

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
}).listen(8080, function() {
    console.log('Listening at: http://localhost:8080');
});


var gameSizeX = 1020;
var gameSizeY = 640;
var nameSizeLimit = 256;
var imageChangeCooldown = 30;

var players = [];
var rooms = [];
var bots = [];
var bullets = [];
var bulletId = 0;

var sessionID = randomInt(0, 65535);
var io = socketio.listen(server);

var speedPlayer = 5;

var gameStart = [];
var infectStart = [];
var infectEnd = [];
var lastImageChange = [];

var lastImage = [];

var lastStateUpdate = 0;

function getPlayerUpdate(player)
{
    if(player !== undefined)
        return {id: player.id, username: player.username, x: player.newX, y: player.newY, monster: player.monster, connected: player.connected};
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
        if(players[p].connected !== 1 || players[p].room !== room)
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
        if(players[p].connected !== 1 || players[p].monster !== 1 || players[p].room !== room)
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

function infectRandomPlayer(room)
{
    if(players.length <= 0 || getConnCount(room) <= 0)
        return;
        
    var trycount = 0;
    while(true)
    {
        trycount++;
        if(trycount >= 3) break;
        var infectid = randomInt(0, players.length);
        var infectidx = getIdxForID(infectid);
        
        // if player ID is invalid, player is disconnected or player is already a monster we'll try again
        if(infectidx < 0 || players[infectidx].connected !== 1 || players[infectidx].monster !== 0 || players[infectidx].room !== room) continue;
        
        players[infectidx].monster = 1;
        console.log('infecting player ' + infectid);
        console.log('conns: ' + getConnCount() + ' monsters: ' + getMonsterCount());
        
        var upd = getPlayerUpdate(players[infectidx]);
        if(upd !== undefined)
            io.sockets.in(room).emit("updatePlayer", upd);
            
        // break out because we've infected someone
        break;
    }
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

function updateBots(room)
{
    var time = Math.round(+new Date()/1000);
    var roombots = getBotsForRoom(room);
    if(roombots.length <= 0)
    {
        // spawn some bots
        
        for(b=0; b<10;b++)
        {
            var randX = randomInt(0, (gameSizeX / 10)) * 10;
            var randY = randomInt(0, (gameSizeY / 10)) * 10;
            var pid = players.length + 1;
            var botplayer = {id: pid, ip: "127.0.0.1", room: room, username: '', x: randX, y: randY, newX: randX, newY: randY, monster: 0, connected: 1, iosock: undefined};
            players.push(botplayer);
            bots.push({playeridx: players.length - 1, targetidx: -1, status: 'think', timer: 0, lastType: 'human'});
            io.sockets.in(room).emit('newPlayer', {id: pid, username: '', x: randX, y: randY, monster: 0, connected: 1});
            console.log('bot spawned, stats: ', botplayer, bots[bots.length - 1]);
        }
        roombots = getBotsForRoom(room);
    }
    for(b=0; b<roombots.length; b++)
    {
        var bot = roombots[b];
        var player = players[bot.playeridx];
        if(player.monster !== 1)
        {
            bot.lastType = 'human';
            if(bot.status === 'think')
            {
                if(player.newX == player.x && player.newY == player.y)
                {
                    // fuck, go somewhere random
                    var randX = randomInt(0, (gameSizeX / 10)) * 10;
                    var randY = randomInt(0, (gameSizeY / 10)) * 10;
                    //return;
                    player.newX = randX;
                    player.newY = randY;
                    var upd = getPlayerUpdate(player);
                    if(upd !== undefined)
                        io.sockets.in(room).emit('updatePlayer', upd);
                    //bot.status = 'attack';
                }
            }
        }
        else
        {
            if(bot.lastType === 'human')
            {                
                if(bot.timer !== 0 && time - bot.timer >= randomInt(2, 7))
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
                // lets choose a target
                var targetdistance = 9999999999;
                var targetidx = -1;
                var targetplayer = undefined;
                for(p=0; p<players.length; p++)
                {
                    if(players[p].monster === 1 || players[p].room !== room) continue;
                    var xd = player.x-players[p].x;
                    var yd = player.y-players[p].y;
                    var dist = Math.abs(Math.sqrt(xd*xd + yd*yd));
                    if(targetdistance > dist)
                    {
                        targetidx = p;
                        targetdistance = dist;
                        targetplayer = players[p];
                        //console.log('bot ', bot, ' chose player ', targetplayer.id);
                    }
                }
                
                //if(targetidx < 0) continue;
                
                var randX = player.newX;
                var randY = player.newY;
                if(targetidx >= 0)
                {
                    randX = targetplayer.x;
                    randY = targetplayer.y;
                }
                else
                {
                    if(randX == player.x && randY == player.y)
                    {
                        randX = randomInt(0, (gameSizeX / 10)) * 10;
                        randY = randomInt(0, (gameSizeY / 10)) * 10
                    }
                }
                bot.targetidx = targetidx;
                if(randX != player.newX || randY != player.newY)
                {
                    player.newX = randX;
                    player.newY = randY;
                    var upd = getPlayerUpdate(player);
                    if(upd !== undefined)
                        io.sockets.in(room).emit('updatePlayer', upd);
                }
                if(targetidx >= 0)
                    bot.status = 'attack';
            }
            else if(bot.status === 'attack' && bot.targetidx >= 0)
            {
                var targetplayer = players[bot.targetidx];
                if(targetplayer.connected !== 1 || targetplayer.monster === 1)
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
                        if(bot.timer === 0)
                            bot.timer = time;
                        else if(time - bot.timer >= randomInt(2, 7))
                        {
                            player.newX = targetplayer.x;
                            player.newY = targetplayer.y;
                            var upd = getPlayerUpdate(player);
                            if(upd !== undefined)
                                io.sockets.in(room).emit('updatePlayer', upd);
                            bot.timer = 0;
                        }
                            
                       // break;
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
        var room = rooms[r];
        var connCount = getConnCount(room);
        var monsterCount = getMonsterCount(room);
        
        if(players.length <= 0 || connCount <= 0)
            return;
            
        var time = Math.round(+new Date()/1000);
        
        updateBots(room);
        /*if((time - lastStateUpdate) >= 10)
        //{
            console.log('sending state update');
            for(p = 0; p < players.length; p++)
            {
                if(players[p].connected !== 1)
                    continue;
                var upd = getPlayerUpdateAbsolute(players[p]);
                if(upd !== undefined)
                    io.sockets.emit("updatePlayerAbsolute", upd);
            }
            lastStateUpdate = time;
        }*/
        
        if(monsterCount >= connCount && infectEnd[r] <= 0) // monsters win
        {
            infectEnd[r] = time;
            console.log('game over @ ' + time);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        }
        if(monsterCount >= connCount && (time - infectEnd[r]) >= 5)
        {
            for(p = 0; p < players.length; p++)
            {
                if(players[p].connected !== 1 || players[p].monster !== 1 || players[p].room !== room)
                    continue;
                players[p].monster = 0;
                var upd = getPlayerUpdate(players[p]);
                if(upd !== undefined)
                    io.sockets.in(room).emit("updatePlayer", upd);
            }
            gameStart[r] = 0;
            infectStart[r] = 0;
            infectEnd[r] = 0;
            console.log('game reset @ ' + time);
            console.log('conns: ' + connCount + ' monsters: ' + getMonsterCount(room));
        }
        if(connCount >= 2 && gameStart[r] <= 0)
        {
            gameStart[r] = time;
            console.log('game start @ ' + time);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        }
        if(connCount >= 2 && gameStart[r] > 0 && infectStart[r] <= 0 && (time - gameStart[r]) >= 15)
        {
            // we have 2 or more players and 30 seconds has passed
            // infect one of them randomly
            infectStart[r] = time;
            console.log('infect start = ' + time);
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
            
            var toinfect = Math.ceil(connCount * 0.3);
            if(toinfect == connCount)
                toinfect--;
            if(toinfect <= 0)
                toinfect = 1;
                
                
            console.log('infecting ' + toinfect + ' random players out of ' + connCount + ' players');
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
                
            for(y = 0; y < toinfect; y++)
                infectRandomPlayer(room);
        }
        
        for(p = 0; p < players.length; p++)
        {
            var player = players[p];
            if(player.connected !== 1 || player.room !== room) continue;
                
            var speed = speedPlayer;
            
            if(player.x<player.newX)
                player.x+=speed;
                
            if(player.x>player.newX)
                player.x-=speed;
                
            if(player.y<player.newY)
                player.y+=speed;
                
            if(player.y>player.newY)
                player.y-=speed;
        }
        for(p = 0; p < players.length; p++)
        {
            var player = players[p];
            if(player.monster !== 1 || player.connected !== 1 || player.room !== room) continue;

            var zombie_box = aabb([player.x - 10, player.y - 10], [30, 30]);
            
            for(py = 0; py < players.length; py++)
            {
                if(players[py].monster == 1 || players[py].id == player.id || players[py].room !== room)
                    continue;
                
                var player_box = aabb([players[py].x, players[py].y], [10, 10]);
                //var intersecting = (player.x - 10 <= (players[py].x + 30)) && (players[py].x <= player.x + 10) && (player.y <= players[py].y + 10) && (players[py].y <= player.y + 10);
                
                //if((vX == ourX && (vY == (ourY - 1) || vY == (ourY + 1))) || (vY == ourY && (vX == (ourX - 1) || vX == (ourX + 1))))
                if(zombie_box.intersects(player_box))
                {
                    players[py].monster = 1;
                    var upd = getPlayerUpdate(players[py]);
                    //monsterCount++;
                    console.log('player ' + player.id + ' infected player ' + players[py].id);
                    console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
                    if(upd !== undefined)
                    {
                        upd.attackerid = player.id;
                        io.sockets.to(player.room).emit("updatePlayer", upd);
                    }
                    if(getMonsterCount(room) >= connCount && infectEnd[r] <= 0)
                        io.sockets.in(room).emit("roundEnd", {id: player.id, victimid: upd.id});
                }
            }
        }
    }
    
    updateBullets();
}

function updateBullets()
{
    // update bullets
    for(i = 0; i < bullets.length; i++)
    {
        bullets[i].x += bullets[i].velocity[0] * 10;
        bullets[i].y += bullets[i].velocity[1] * 10;

        // kill bullet if it is outside of canvas
        if(bullets[i].x > gameSizeX || bullets[i].x < 0 || bullets[i].y > gameSizeY || bullets[i].y < 0)
        {
            bullets[i].alive = 0;
            io.sockets.in(bullets[i].room).emit("updateBullet", {id: bullets[i].id, x: bullets[i].x, y: bullets[i].y, alive: bullets[i].alive});
        }

        if(bullets[i].alive == 0)
        {
            bullets.splice(i, 1);
            continue;
        }
        
        var idx = getIdxForID(bullets[i].playerId);
        if(idx >= 0 && players.length > idx && players[idx].monster !== 1)
        {
            var bullet_box = aabb([bullets[i].x, bullets[i].y], [5, 5]);
            for(p = 0; p < players.length; p++)
            {
                if(players[p].id === bullets[i].playerId || players[p].monster !== 1) continue;
                var player = players[p];
                var player_box = aabb([players[p].x, players[p].y], [10, 10]);
                if(bullet_box.intersects(player_box))
                {
                    console.log('player hit ' + player.id);
                    // player hit!
                    player.x += (bullets[i].velocity[0] * 100);
                    player.y += (bullets[i].velocity[1] * 100);
                    if(player.x < 0) player.x = 0;
                    if(player.y < 0) player.y = 0;
                    if(player.x >= gameSizeX) player.x = gameSizeX - 10;
                    if(player.y >= gameSizeY) player.y = gameSizeY - 10;
                    player.newX = player.x;
                    player.newY = player.y;
                    var upd = getPlayerUpdate(players[p]);
                    if(upd !== undefined)
                    {
                        //upd.attackerid = player.id;
                        io.sockets.emit("updatePlayer", upd);
                    }
                    bullets[i].alive = 0;
                    break;
                }
            }
        }
        
        if(bullets[i].alive == 0)
        {
            bullets.splice(i, 1);
            continue;
        }
    }
}

setInterval(updateWorld,100);
//setInterval(updateBullets, 10);

io.on('connection', function (socket)
{    
    var remoteAddress = socket.request.connection.remoteAddress;
    
    socket.on('joinRoom', function (msg)
    {
        var player = getPlayerForSocket(socket);
        
        if(!(rooms.indexOf(msg.room) > -1))
        {
            rooms.push(msg.room);
            gameStart.push(0);
            infectStart.push(0);
            infectEnd.push(0);
            lastImageChange.push(0);
            lastImage.push("");
        }
            
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
            
            var randX = randomInt(0, (gameSizeX / 10)) * 10;
            var randY = randomInt(0, (gameSizeY / 10)) * 10;
            
            var monst = 0;
           // if(pid == 1) monst = 1;
            
            players.push({id: pid, ip: remoteAddress, room: msg.room, username: '', x: randX, y: randY, newX: randX, newY: randY, monster: monst, firstFire: 0, fireCount: 0, connected: 1, iosock: socket});
            socket.emit('gameState', {id: pid, x: gameSizeX, y: gameSizeY, session: sessionID, image: lastImage[rooms.indexOf(msg.room)]});
            socket.broadcast.to(msg.room).emit('newPlayer', {id: pid, username: '', x: randX, y: randY, monster: monst, connected: 1});
            
            console.log('conns: ' + getConnCount() + ' monsters: ' + getMonsterCount());
        }
        // send player list to client
        for(p = 0; p < players.length; p++)
        {
            if(players[p].room !== msg.room) continue;
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
                socket.emit('newPlayer', upd);
        }
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
        var time = Math.round(+new Date()/1000);
        for(p = 0; p < players.length; p++)
        {
            if(players[p].id !== msg.id)
                continue;
            if(players[p].ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + players[p].ip);
                break;
            }
            if(players[p].firstFire === undefined || players[p].firstFire === 0)
                players[p].firstFire = time;
            else if(time - players[p].firstFire >= 5)
            {
                players[p].firstFire = 0;
                players[p].fireCount = 0;
            }
            if(players[p].fireCount !== undefined && players[p].fireCount > 15)
                break;

            players[p].fireCount++;

            var originX = players[p].x + 5;
            var originY = players[p].y + 5;
            var velocity = normalize(msg.x - originX, msg.y - originY);

            // Push bullet into array, have it keep track of its own room and emit the bullet to room that spawned it
            //
            // At the moment every bullet gets a unique id from a basic incrementing counter, I don't think it'll overflow
            // but if it ever comes to it, we can just keep an array to store id values that can be recycled and reuse those
            bullets.push({id: bulletId, playerId: msg.id, x: originX, y: originY, velocity: velocity, alive: 1, room: players[p].room});
            socket.broadcast.to(players[p].room).emit('newBullet', {id: bulletId, playerId: msg.id, x: originX, y: originY, velocity: velocity, alive: 1});
            socket.emit('newBullet', {id: bulletId, playerId: msg.id, x: originX, y: originY, velocity: velocity, alive: 1});

            bulletId++;
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
        
        var time = Math.round(+new Date()/1000);
        var roomidx = rooms.indexOf(player.room);
        var validImage = (time - lastImageChange[roomidx] >= imageChangeCooldown);
        
        if((validImage || remoteAddress == "127.0.0.1" || remoteAddress == "localhost") && msg.src.length > 4 && msg.src.substring(0, 4) === "http")
        {
            socket.broadcast.to(player.room).emit('updateImage', msg);
            socket.emit('updateImage', msg);
            lastImageChange[roomidx] = time;
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
        var name = msg.username;
        if(name.length > nameSizeLimit)
            name = name.substring(0, nameSizeLimit);
            
        var trip_index = name.indexOf('#');
        var trip;

        if (trip_index > -1) {
            trip = name.substr(trip_index + 1);
            //var secure = trip.indexOf('#') === 0;
            //if (secure) {
            //    trip = crypto.createHash('sha1').update(trip.substr(1) +
            //           config.securetrip_salt).digest('base64').toString();
            //}
            name = name.slice(0, trip_index) + " !" + tripcode(trip);
        }
        for(p = 0; p < players.length; p++)
        {
            if(players[p].id !== msg.id)
                continue;
            if(players[p].ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + players[p].ip);
                break;
            }
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
    
    socket.on('changeSize', function(msg)
    {
        if(socket.request.connection.remoteAddress !== "127.0.0.1" && socket.request.connection.remoteAddress !== "localhost")
        {
            console.log('attempted hack into admin command, ip: ' + remoteAddress);
            return;
        }
        gameSizeX = msg.x;
        gameSizeY = msg.y;
        for(p = 0; p < players.length; p++)
        {
            var player = players[p];
            if(player.connected !== 1) continue;
            
            player.iosock.emit('ID', {id: player.id, x: gameSizeX, y: gameSizeY, session: sessionID, image: lastImage[rooms.indexOf(player.room)]});
            // todo: fix this
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
            players[p].connected = 0;
            var player = players[p];
            var upd = getPlayerUpdate(player);
            //connCount--;
            //if(players[p].monster === 1)
            //    monsterCount--;
            console.log('player ' + player.id + ' disconnected');
            console.log('conns: ' + getConnCount() + ' monsters: ' + getMonsterCount());
            
            if(upd !== undefined)
            {
                socket.broadcast.to(player.room).emit('updatePlayer', upd);
                //io.sockets.emit('updatePlayer', upd);
                console.log('sent disconnected player update');
            }
            break;
        }
    });
});