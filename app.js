var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io');
 
var indexdata = fs.readFileSync(__dirname + '/index.html');
var sourcedata = fs.readFileSync(__dirname + '/app.js');

var server = http.createServer(function(req, res) {
    if(req.url === '/devindex.html')
    {
        res.writeHead(200, { 'Content-type': 'text/html'});
        res.end(fs.readFileSync(__dirname + '/index.html'));
    } else if(req.url !== '/app.js')
    {
        res.writeHead(200, { 'Content-type': 'text/html'});
        res.end(indexdata);
    } else {
        res.writeHead(200, { 'Content-type': 'application/javascript'});
        res.end(sourcedata);
    }
    console.log('conn to ' + req.url);
}).listen(8080, function() {
    console.log('Listening at: http://localhost:8080');
});

var players = [];
var player_id = 0;

var io = socketio.listen(server);

function randomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}
var startTime = 0;

function getConnectedPlayerCount()
{
    var count = 0;
    for(p=0;p<players.length;p++)
    {
        if(players[p].connected !== 1)
            continue;
        count++;
    }
    return count;
}

function getInfectedPlayerCount()
{
    var count = 0;
    for(p=0;p<players.length;p++)
    {
        if(players[p].monster !== 1)
            continue;
        count++;
    }
    return count;
}

function resetGame()
{
    var curTime = Math.round(+new Date()/1000);
    var roundLimit = getConnectedPlayerCount() * 30;
    if(curTime - startTime < roundLimit)
    {
        setTimeout(function() { resetGame(); }, (roundLimit - (curTime - startTime)) * 1000);
        return;
    }
    for(p=0;p<players.length;p++)
    {
        players[p].monster = 0;
        io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: 0});
    }
    setTimeout(function(){ infectRandomPlayer(); }, 15 * 1000);
}
function infectRandomPlayer()
{
    var playeridx = randomInt(1, player_id);
    for(p=0;p<players.length;p++)
    {
        if(players[p].id !== playeridx)
            continue;

        players[p].monster = 1;
        io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: 1, connected: players[p].connected});
        break;
    }
    startTime = Math.round(+new Date()/1000);
    setTimeout(function() { resetGame(); }, 60 * 1000);
}

setTimeout(function(){ infectRandomPlayer(); }, 60 * 1000);

var allClients = [];

io.on('connection', function (socket) {
    allClients.push(socket);
    
    socket.on('ID', function (msg) {
        console.log('connection from ID: ', msg);
        player_id++;
        var pid = player_id;
        
        var randX = randomInt(0, 98);
        var randY = randomInt(0, 98);
        
        players.push({id:pid,ip:socket.handshake.address,x:(randX*10),y:(randY*10),monster:0,connected:1,iosock:socket});
        socket.emit('ID', { ID: pid });
        socket.broadcast.emit('newPlayer', {id: pid, x:(randX*10),y:(randY*10),monster:0,connected:1});
        
        for(p=0;p<players.length;p++)
        {
            socket.emit('newPlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: players[p].monster, connected: players[p].connected});
        }
    });
    
    socket.on('position', function (msg) {
        if(msg.id > player_id)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        console.log('position: ', msg);
        if(msg.x < 1000 && msg.y < 1000)
        {
            for(p=0;p<players.length;p++)
            {
                if(players[p].id !== msg.id)
                    continue;
                if(players[p].ip !== socket.handshake.address)
                    break;
                players[p].x = msg.x;
                players[p].y = msg.y;
                if(players[p] !== undefined)
                    socket.broadcast.emit('updatePlayer', {id: msg.id, x: msg.x, y: msg.y, monster: players[p].monster});
                if(players[p] !== undefined)
                    socket.emit('updatePlayer', {id: msg.id, x: msg.x, y: msg.y, monster: players[p].monster});
                break;
            }
        }
    });
    
    socket.on('disconnect', function() {
        for(p=0;p<players.length;p++)
        {
            if(players[p].iosock !== socket)
                continue;
            console.log('player ' + players[p].id + ' disconnected');
            players[p].connected = 0;
            io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: players[p].monster, connected: players[p].connected});
            break;
        }
    });
    
    socket.on('infect', function(msg) {
        if(msg.id > player_id)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        console.log('infect: ', msg);
        
        var ismonster = 0;
        for(p=0;p<players.length;p++)
        {
            if(players[p].id !== msg.id)
                continue;
            ismonster = players[p].monster == 1;
            break;
        }
        
        if(!ismonster)
            return;
            
        for(p=0;p<players.length;p++)
        {
            if(players[p].id !== msg.victimid)
                continue;
            players[p].monster = 1;
            socket.broadcast.emit('updatePlayer', {id: msg.victimid, x: players[p].x, y: players[p].y, monster: players[p].monster});
            socket.emit('updatePlayer', {id: msg.victimid, x: players[p].x, y: players[p].y, monster: players[p].monster});
            break;
        }
    });
});