var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io');

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


var gameSizeX = 1000;
var gameSizeY = 600;
var nameSizeLimit = 256;
var imageChangeCooldown = 30;

var players = [];
var playerCount = 0;
var connCount = 0;
var monsterCount = 0;



var sessionID = randomInt(0, 65535);
var io = socketio.listen(server);

var speedPlayer = 0.5;

var gameStart = 0;
var infectStart = 0;
var infectEnd = 0;

var lastImageChange = 0;
var lastImage = "http://www.redditstatic.com/about/assets/reddit-alien.png";

function getPlayerUpdate(player)
{
    if(player !== undefined)
        return {id: player.id, username: player.username, x: player.newX, y: player.newY, monster: player.monster, connected: player.connected};
    return undefined;
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

function infectRandomPlayer()
{
    if(connCount <= 0 || playerCount <= 0)
        return;
        
    var trycount = 0;
    while(true)
    {
        //if(trycount >= 10) break;
        trycount++
        var infectid = randomInt(0, playerCount);
        var infectidx = getIdxForID(infectid);
        if(infectidx < 0) continue;
        if(players[infectidx].connected !== 1) continue;
        if(players[infectidx].monster !== 0) continue;
        
        players[infectidx].monster = 1;
        monsterCount++;
        console.log('infecting player ' + infectid);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        var upd = getPlayerUpdate(players[infectidx]);
        if(upd !== undefined)
            io.sockets.emit("updatePlayer", upd);
        break;
    }
    return true;//trycount < 3;
}

function updateWorld()
{
    if(connCount <= 0 || playerCount <= 0)
        return;
    var time = Math.round(+new Date()/1000);
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
        
        
        if(player.monster == 1)
        {
            // player is monster and player is us
            var ourX = Math.floor(player.x / 10);
            var ourY = Math.floor(player.y / 10);
            for(py = 0; py < players.length; py++)
            {
                if(players[py].monster == 1 || players[py].id == player.id)
                    continue;
                var vX = Math.floor(players[py].x / 10);
                var vY = Math.floor(players[py].y / 10);
                
                if((vX == ourX && (vY == (ourY - 1) || vY == (ourY + 1))) || (vY == ourY && (vX == (ourX - 1) || vX == (ourX + 1))))
                {
                    players[py].monster = 1;
                    monsterCount++;
                    console.log('player ' + player.id + ' infected player ' + players[py].id);
                    console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
                    var upd = getPlayerUpdate(players[py]);
                    if(upd !== undefined)
                        io.sockets.emit("updatePlayer", upd);
                }
            }
        }
    }
}

setInterval(updateWorld,10);

io.on('connection', function (socket)
{    
    socket.on('ID', function (msg)
    {
        playerCount++;
        connCount++;
        
        var pid = playerCount;
        console.log('new player at ID ' + pid);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        
        var randX = randomInt(0, (gameSizeX / 10)) * 10;
        var randY = randomInt(0, (gameSizeY / 10)) * 10;
        
        var monst = 0;
       // if(pid == 1) monst = 1;
        
        players.push({id: pid, ip: socket.handshake.address, username: '', x: randX, y: randY, newX: randX, newY: randY, monster: monst, connected: 1, iosock: socket});
        socket.emit('ID', {id: pid, x: gameSizeX, y: gameSizeY, session: sessionID, image: lastImage});
        socket.broadcast.emit('newPlayer', {id: pid, username: '', x: randX, y: randY, monster: monst, connected: 1});
        
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
        if(msg.session !== sessionID || msg.id > playerCount)
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
            if(players[p].ip !== socket.handshake.address)
                break;
                
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
        if(msg.session !== sessionID || msg.id > playerCount)
        {   
            socket.emit('refresh', {time:'now'});
            return;
        }
        
        var time = Math.round(+new Date()/1000);
        if(time - lastImageChange >= imageChangeCooldown && msg.src.length > 4 && msg.src.substring(0, 4) === "http")
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
        if(msg.session !== sessionID || msg.id > playerCount)
        {   
            socket.emit('refresh', {time:'now'});
            return;
        }
        if(msg.username === undefined) return;
        var name = msg.username;
        if(name.length > nameSizeLimit)
            name = name.substring(0, nameSizeLimit);
        for(p = 0; p < players.length; p++)
        {
            if(players[p].id !== msg.id)
                continue;
            if(players[p].ip !== socket.handshake.address)
                break;
            players[p].username = name;
            var upd = getPlayerUpdate(players[p]);
            console.log('updating player ' + players[p].id + ' username to ' + players[p].username);
            if(upd !== undefined)
            {
                socket.broadcast.emit('updatePlayer', upd);
                socket.emit('updatePlayer', upd);
                console.log('updated');
            }
            break;
        }
    });
    
    socket.on('disconnect', function()
    {
        for(p = 0; p < players.length; p++)
        {
            if(players[p].iosock !== socket)
                continue;
            players[p].connected = 0;
            connCount--;
            if(players[p].monster === 1)
                monsterCount--;
            console.log('player ' + players[p].id + ' disconnected');
            console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
            
            var upd = getPlayerUpdate(players[p]);
            if(upd !== undefined)
                io.sockets.emit('updatePlayer', upd);
            break;
        }
    });
});