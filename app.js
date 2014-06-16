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
var canvasHeight = 600;
var canvasWidth = 1000;
var monsterSpeed = 0.55;

var io = socketio.listen(server);

function randomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}
var startTime = 0;
var zombieSelected = 0;
var secondsUntilRandomInfection = 30;

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
        if(players[p].connected !== 1 || players[p].monster !== 1)
            continue;
        count++;
    }
    return count;
}

function resetGame()
{
    var curTime = Math.round(+new Date()/1000);
    var roundLimit = getConnectedPlayerCount() * 15;
    if(getInfectedPlayerCount() >= getConnectedPlayerCount())
        roundLimit = 0;
        
    if(curTime - startTime < roundLimit)
    {
        setTimeout(function() { resetGame(); }, (roundLimit - (curTime - startTime)) * 1000);
        return;
    }
    for(p=0;p<players.length;p++)
    {
        // if player is a bot, keep them as a monster
        if(players[p].bot == 1) {
            players[p].monster = 1;
            io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: 1, bot: players[p].bot, connected: players[p].connected});
        } else {
            players[p].monster = 0;
            io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: 0, bot: players[p].bot, connected: players[p].connected});
        }
    }
    zombieSelected = 0;
    setTimeout(function(){ infectRandomPlayer(); }, 15 * 1000);
}
function infectRandomPlayer()
{
    if(getInfectedPlayerCount() >= getConnectedPlayerCount())
        return;
    var playeridx = randomInt(1, player_id);
    for(p=0;p<players.length;p++)
    {
        if(players[p].id !== playeridx)
            continue;
        if(players[p].connected !== 1 || players[p].monster === 1)
        {
            infectRandomPlayer();
            return;
        }

        players[p].monster = 1;
        io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: 1, bot: players[p].bot, connected: players[p].connected});
        console.log('infected random player ' + players[p].id);
        zombieSelected = 1;
        break;
    }
}
function startGame()
{
    infectRandomPlayer();
    startTime = Math.round(+new Date()/1000);
    setTimeout(function() { resetGame(); }, 60 * 1000);
    spawnBots();
}

// Copied mostly from "socket.on('ID', function(msg) {})" block
function spawnBots() {
    for(i = 0; i < randomInt(10, 20); i++) {
        player_id++;
        var pid = player_id;

        var randX = randomInt(0, 98);
        var randY = randomInt(0, 58);

        // Should bots get a fake iosock and ip?
        players.push({id: pid, x: (randX * 10), y: (randY * 10), monster: 1, bot: 1, connected: 1})
        io.sockets.emit('ID', { ID: pid });
        io.sockets.emit('newPlayer', {id: pid, x: (randX * 10), y: (randY * 10), monster: 1, bot: 1, connected: 1});

        for(p = 0; p < players.length; p++) {
            io.sockets.emit('newPlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
        }
    }
}

// Generate new positions for all player bots, then emit 'position', pretending as if a player has just clicked their mouse
function updateBots() {
    for(i = 0; i < players.length; i++) {
        if(players[i].bot == 1) {
            var direction = randomInt(0, 4);
            var newX = players[i].x;
            var newY = players[i].y;

            // Move bots in a random direction (not towards players yet)
            if(direction == 0) {
                newX += monsterSpeed;
            } else if(direction == 1) {
                newX -= monsterSpeed;
            } else if(direction == 2) {
                newY += monsterSpeed;
            } else if(direction == 3) {
                newY -= monsterSpeed;
            }

            // Keep bots within the canvas
            if(newX > canvasWidth) {
                newX = canvasWidth;
            }
            if(newX < 0) {
                newX = 0;
            }
            if(newY > canvasHeight) {
                newY = canvasHeight;
            }
            if(newY < 0) {
                newY = 0;
            }

            players[i].x = newX;
            players[i].y = newY;
            io.sockets.emit('position', {id: players[i].id, x: newX, y: newY})
        }
    }
}

setTimeout(function(){ startGame(); }, 60 * 1000);

var allClients = [];

io.on('connection', function (socket) {
    allClients.push(socket);
    
    socket.on('ID', function (msg) {
        console.log('connection from ID: ', msg);
        player_id++;
        var pid = player_id;
        
        var randX = randomInt(0, 98);
        var randY = randomInt(0, 58);
        
        players.push({id:pid, ip:socket.handshake.address, x:(randX*10), y:(randY*10), monster:0, bot:0, connected:1, iosock:socket});
        socket.emit('ID', { ID: pid });
        socket.broadcast.emit('newPlayer', {id: pid, x:(randX*10), y:(randY*10), monster:0, bot:0, connected:1});
        
        for(p=0;p<players.length;p++)
        {
            socket.emit('newPlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
        }
    });
    
    socket.on('position', function (msg) {
        // I think it's safe to update the bot's positions serverside here
        updateBots();
        if(msg.id > player_id)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        //console.log('position: ', msg);
        if(msg.x < 1000 && msg.y < 600)
        {
            for(p=0;p<players.length;p++)
            {
                if(players[p].id !== msg.id)
                    continue;
                if(players[p].ip !== socket.handshake.address)
                    break;
                // if(players[p].bot == 1) // Not sure if this is necessary here, uncomment this if things don't work
                //     break;
                players[p].x = msg.x;
                players[p].y = msg.y;
                if(players[p] !== undefined)
                    socket.broadcast.emit('updatePlayer', {id: msg.id, x: msg.x, y: msg.y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
                if(players[p] !== undefined)
                    socket.emit('updatePlayer', {id: msg.id, x: msg.x, y: msg.y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
                    
                if(zombieSelected == 1)
                {
                    if(getInfectedPlayerCount() <= 0)
                    {
                        console.log('restarting round because no zombies');
                        infectRandomPlayer();
                    }
                    if(getInfectedPlayerCount() >= getConnectedPlayerCount())
                    {
                        console.log('round ended, player ' + msg.id + ' infected player ' + msg.victimid);
                        if(zombieSelected === 1)
                            setTimeout(function() { resetGame(); }, 5 * 1000);
                        zombieSelected = 0;
                    }
                    if(getInfectedPlayerCount() <= 1 && (Math.round(+new Date()/1000) - startTime) >= secondsUntilRandomInfection)
                    {
                        console.log('infecting another random player');
                        var toinfect = Math.ceil(getConnectedPlayerCount() * 0.30);
                        if(getConnectedPlayerCount() > toinfect)
                        {
                           // for(var y = 0; y < toinfect; y++)
                            //    infectRandomPlayer();
                        }
                    }
                }
                break;
            }
        }
    });
    
    socket.on('disconnect', function() {
        for(p=0;p<players.length;p++)
        {
            // I think we should be continuing the function if the player's a bot, remove the bot check otherwise
            if(players[p].iosock !== socket || players[p].bot == 1)
                continue;
            console.log('player ' + players[p].id + ' disconnected');
            players[p].connected = 0;
            io.sockets.emit('updatePlayer', {id: players[p].id, x: players[p].x, y: players[p].y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
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
            if(players[p] !== undefined)
                socket.broadcast.emit('updatePlayer', {id: msg.victimid, x: players[p].x, y: players[p].y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
            if(players[p] !== undefined)
                socket.emit('updatePlayer', {id: msg.victimid, x: players[p].x, y: players[p].y, monster: players[p].monster, bot: players[p].bot, connected: players[p].connected});
            if(getInfectedPlayerCount() >= getConnectedPlayerCount())
            {
                console.log('round ended, player ' + msg.id + ' infected player ' + msg.victimid);
                setTimeout(function() { resetGame(); }, 5 * 1000);
            }
            break;
        }
    });
});