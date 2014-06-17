var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io')
    , aabb = require('aabb-2d')
    , tripcode = require('tripcode');

function randomInt (low, high)
{
    return Math.floor(Math.random() * (high - low) + low);
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

var sessionID = randomInt(0, 65535);
var io = socketio.listen(server);

var speedPlayer = 0.5;

var gameStart = 0;
var infectStart = 0;
var infectEnd = 0;

var lastImageChange = 0;
var lastImage = "http://www.tisuddevalla.se/~antonlahtinen/wp-content/uploads/2013/10/Worpress-walpepr-1024x640.jpg";

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

function getConnCount()
{
    var count = 0;
    for(p = 0; p < players.length; p++)
    {
        if(players[p].connected !== 1)
            continue;
        count++;
    }
    return count;
}

function getMonsterCount()
{
    var count = 0;
    for(p = 0; p < players.length; p++)
    {
        if(players[p].connected !== 1 || players[p].monster !== 1)
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

function playerSocketExists(socket)
{
    for(p = 0; p < players.length; p++)
    {
        if(players[p].iosock !== socket) continue;
        return true;
    }
    return false;
}

function infectRandomPlayer()
{
    if(players.length <= 0 || getConnCount() <= 0)
        return;
        
    var trycount = 0;
    while(true)
    {
        trycount++;
        if(trycount >= 3) break;
        var infectid = randomInt(0, players.length);
        var infectidx = getIdxForID(infectid);
        
        // if player ID is invalid, player is disconnected or player is already a monster we'll try again
        if(infectidx < 0 || players[infectidx].connected !== 1 || players[infectidx].monster !== 0) continue;
        
        players[infectidx].monster = 1;
        console.log('infecting player ' + infectid);
        console.log('conns: ' + getConnCount() + ' monsters: ' + getMonsterCount());
        
        var upd = getPlayerUpdate(players[infectidx]);
        if(upd !== undefined)
            io.sockets.emit("updatePlayer", upd);
            
        // break out because we've infected someone
        break;
    }
}

function updateWorld()
{
    var connCount = getConnCount();
    var monsterCount = getMonsterCount();
    
    if(players.length <= 0 || connCount <= 0)
        return;
    var time = Math.round(+new Date()/1000);
    
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
    
    if(monsterCount >= connCount && infectEnd <= 0) // monsters win
    {
        infectEnd = time;
        console.log('game over @ ' + time);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
    }
    if(monsterCount >= connCount && (time - infectEnd) >= 5)
    {
        for(p = 0; p < players.length; p++)
        {
            if(players[p].connected !== 1 || players[p].monster !== 1)
                continue;
            players[p].monster = 0;
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
                io.sockets.emit("updatePlayer", upd);
        }
        gameStart = 0;
        infectStart = 0;
        infectEnd = 0;
        monsterCount = 0;
        console.log('game reset @ ' + time);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
    }
    if(connCount >= 2 && gameStart <= 0)
    {
        gameStart = time;
        console.log('game start @ ' + time);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
    }
    if(connCount >= 2 && gameStart > 0 && infectStart <= 0 && (time - gameStart) >= 30)
    {
        // we have 2 or more players and 30 seconds has passed
        // infect one of them randomly
        infectStart = time;
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
            infectRandomPlayer();
    }
    
    for(p = 0; p < players.length; p++)
    {
        var player = players[p];
        if(player.connected !== 1)
            continue;
            
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
        if(player.monster !== 1) continue;

        var zombie_box = aabb([player.x - 10, player.y - 10], [30, 30]);
        
        for(py = 0; py < players.length; py++)
        {
            if(players[py].monster == 1 || players[py].id == player.id)
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
                    io.sockets.emit("updatePlayer", upd);
                }
            }
        }
        
    }
}

setInterval(updateWorld,10);

io.on('connection', function (socket)
{    
    var remoteAddress = socket.request.connection.remoteAddress;
    
    socket.on('ID', function (msg)
    {
        if(playerSocketExists(socket)) return;
        
        var pid = players.length + 1;
        console.log('new player at ID ' + pid + ', IP ' + remoteAddress);
        
        var randX = randomInt(0, (gameSizeX / 10)) * 10;
        var randY = randomInt(0, (gameSizeY / 10)) * 10;
        
        var monst = 0;
       // if(pid == 1) monst = 1;
        
        players.push({id: pid, ip: remoteAddress, username: '', x: randX, y: randY, newX: randX, newY: randY, monster: monst, connected: 1, iosock: socket});
        socket.emit('ID', {id: pid, x: gameSizeX, y: gameSizeY, session: sessionID, image: lastImage});
        socket.broadcast.emit('newPlayer', {id: pid, username: '', x: randX, y: randY, monster: monst, connected: 1});
        
        console.log('conns: ' + getConnCount() + ' monsters: ' + getMonsterCount());
        
        // send player list to client
        for(p = 0; p < players.length; p++)
        {
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
                socket.emit('newPlayer', upd);
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
                socket.broadcast.emit('updatePlayer', upd);
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
        
        var time = Math.round(+new Date()/1000);
        var validImage = (time - lastImageChange >= imageChangeCooldown && msg.src.length > 4 && msg.src.substring(0, 4) === "http")
        if(validImage || remoteAddress == "127.0.0.1" || remoteAddress == "localhost")
        {
            socket.broadcast.emit('updateImage', msg);
            socket.emit('updateImage', msg);
            lastImageChange = time;
            lastImage = msg.src;
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
                socket.broadcast.emit('updatePlayer', upd);
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
            player.iosock.emit('ID', {id: player.id, x: gameSizeX, y: gameSizeY, session: sessionID, image: lastImage});
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
            }
        }
    });
    
    socket.on('disconnect', function()
    {
        for(p = 0; p < players.length; p++)
        {
            if(players[p].iosock !== socket)
                continue;
            players[p].connected = 0;
            var upd = getPlayerUpdate(players[p]);
            //connCount--;
            //if(players[p].monster === 1)
            //    monsterCount--;
            console.log('player ' + players[p].id + ' disconnected');
            console.log('conns: ' + getConnCount() + ' monsters: ' + getMonsterCount());
            
            if(upd !== undefined)
            {
                socket.broadcast.emit('updatePlayer', upd);
                //io.sockets.emit('updatePlayer', upd);
                console.log('sent disconnected player update');
            }
            break;
        }
    });
});