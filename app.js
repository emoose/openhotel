var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io');
 
var indexdata = fs.readFileSync(__dirname + '/index.html');
var jsdata = fs.readFileSync(__dirname + '/jquery.js');
var sourcedata = fs.readFileSync(__dirname + '/app.js');

var server = http.createServer(function(req, res) {
    if(req.url !== '/jquery.js' && req.url !== '/app.js')
    {
        res.writeHead(200, { 'Content-type': 'text/html'});
        res.end(indexdata);
    } else {
        res.writeHead(200, { 'Content-type': 'application/javascript'});
        if(req.url === '/app.js')
            res.end(sourcedata);
        else
            res.end(jsdata);
    }
    console.log('conn to ' + req.url);
}).listen(8080, function() {
    console.log('Listening at: http://localhost:8080');
});

var players = [];
var player_id = 1;
 
socketio.listen(server).on('connection', function (socket) {
    socket.on('ID', function (msg) {
        console.log('connection from ID: ', msg);
        var pid = player_id;
        player_id++;
        players.push({id:pid,x:0,y:0})
        
        socket.emit('ID', { ID: pid });
        socket.broadcast.emit('newPlayer', {id: pid, x: 0, y: 0});
        
        for(p=0;p<players.length;p++)
        {
            socket.emit('newPlayer', {id: players[p].id, x: players[p].x, y: players[p].y});
        }
    });
    
    socket.on('position', function (msg) {
        console.log('position: ', msg);
        if(msg.x < 500 && msg.y < 500)
        {
            for(p=0;p<players.length;p++)
            {
                if(players[p].id !== msg.id)
                    continue;
                players[p].x = msg.x;
                players[p].y = msg.y;
            }
            socket.broadcast.emit('updatePlayer', {id: msg.id, x: msg.x, y: msg.y});
            socket.emit('updatePlayer', {id: msg.id, x: msg.x, y: msg.y});
        }
    });
});