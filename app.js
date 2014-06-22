    // Node modules
var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io')
    , aabb = require('aabb-2d')
    , git = require('git-rev')
    // Native/local modules
    , math = require('./lib/math')
    , utils = require('./lib/utils')
    , shottypes = require('./lib/shottypes')
    , players = require('./lib/players')
    , bots = require('./lib/bots')
    , zombies = require('./lib/gametypes/zombies');
var config =
{
// imgur ids to default backgrounds
// bg is chosen at random when someone joins an empty room
// some are nsfw, but its your own fault for playing a game at work where people can change the background to any picture
    defaultBackgrounds: [
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
],
    gameSizeX: 1024,
    gameSizeY: 1024,
    nameSizeLimit: 256,
    runningBehindProxy: false,
// time limits, in seconds
    imageChangeCooldown: 30,
    roundTimeLimit: 5 * 60,
// how long bots should wait after being hit, randomly chosen between these numbers
    botWaitLimitLower: 1.5,
    botWaitLimitUpper: 4,
    serverVersion: "unknown",
    players: [],
    rooms: [],
    bots: [],
    bullets: [],
    bulletId: 0,
    bulletPush: 100, // multiplier for how far to push zombies away
    sessionID: math.randomInt(0, 65535),
    speedPlayer: 1.25, // speed multiplier, speed is 0.5 * this
    speedMonster: 0.75,
    speedBullet: 2.0,
    gameStart: [],
    infectStart: [],
    infectEnd: [],
    lastImage: [],
    lastImageChange: [],
    lastImageUserChange: [],
    currentTime: [],
    serverPassword: [],
    io: undefined
};
var indexdata = fs.readFileSync(__dirname + '/public/index.html');
var sourcedata = fs.readFileSync(__dirname + '/app.js');
var listeningport = Number((config.runningBehindProxy && process.env.PORT) || 8080);
config.serverPassword = "default";
if(fs.existsSync(__dirname + '/password.txt'))
{
  config.serverPassword = fs.readFileSync(__dirname + '/password.txt', 'utf8'); // todo: use hashes
}
config.serverPassword = config.serverPassword.replace(/^\s+|\s+$/g, '');
console.log('server password:', config.serverPassword);
git.short(function(str)
{
    var ver = str;
    if(ver === undefined || ver === '')
        ver = "unknown";
    config.serverVersion = ver;
    console.log('(running version ' + ver + ')');
});
var http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    port = process.argv[2] || 8080;
var server = http.createServer(function(request, response)
{
  var uri = "./public" + url.parse(request.url).pathname, filename = path.join(process.cwd(), uri);
  path.exists(filename, function(exists)
  {
    if(!exists)
    {
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.write("404 Not Found\n");
      response.end();
      return;
    }
    if (fs.statSync(filename).isDirectory())
    {
      filename += '/index.html';
    }
    fs.readFile(filename, "binary", function(err, file)
    {
      if(err)
      {
        response.writeHead(500, {"Content-Type": "text/plain"});
        response.write(err + "\n");
        response.end();
        return;
      }
      response.writeHead(200);
      response.write(file, "binary");
      response.end();
    });
  });
}).listen(parseInt(port, 10));
console.log("openhotel server is running at => http://localhost:" + port + "/\nCTRL + C to shutdown");
config.io = socketio.listen(server);
function updateWorld()
{
    for(r=0; r<config.rooms.length; r++)
    {
        var ct = config.currentTime[r];
        var newtime = utils.getHighResTime();
        var frametime = newtime - ct;
        config.currentTime[r] = newtime;
        var room = config.rooms[r];
        var connCount = players.getConnCount(room, config);
        if(config.players.length <= 0 || connCount <= 0)
        {
          return;
        }
        var time = utils.getTime();
        if(time - config.lastImageChange[r] >= 60 && time - config.lastImageUserChange[r] >= (3 * 60))
        {
            config.lastImage[r] = "http://i.imgur.com/" + config.defaultBackgrounds[math.randomInt(0, config.defaultBackgrounds.length - 1)] + ".jpg";
            console.log('changing room ' + room + ' image to ' + config.lastImage[r]);
            var msg = {src: config.lastImage[r]};
            config.io.sockets.to(room).emit('updateImage', msg);
            config.lastImageChange[r] = time;
        }
        bots.update(room, config);
        zombies.update(room, config);
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(!player.connected || player.room !== room)
            {
              continue;
            }
            var speed = (5 * config.speedPlayer) * (frametime / 100);
            if(player.x<player.newX || (player.moveRight && !player.bulletHit))
            {
                player.x+=speed;
                if(player.moveRight && !player.bulletHit)
                {
                  player.newX = player.x; player.newY = player.y;
                }
                if(player.x > player.newX)
                {
                  player.x = player.newX;
                }
            }
            if(player.x>player.newX || (player.moveLeft && !player.bulletHit))
            {
                player.x-=speed;
                if(player.moveLeft && !player.bulletHit)
                {
                  player.newX = player.x; player.newY = player.y;
                }
                if(player.x < player.newX)
                {
                  player.x = player.newX;
                }
            }
            if(player.y<player.newY || (player.moveDown && !player.bulletHit))
            {
                player.y+=speed;
                if(player.moveDown && !player.bulletHit)
                {
                  player.newX = player.x; player.newY = player.y;
                }
                if(player.y > player.newY)
                {
                  player.y = player.newY;
                }
            }
            if(player.y>player.newY || (player.moveUp && !player.bulletHit))
            {
                player.y-=speed;
                if(player.moveUp && !player.bulletHit)
                {
                  player.newX = player.x; player.newY = player.y;
                }
                if(player.y < player.newY)
                {
                  player.y = player.newY;
                }
            }
            if(player.x < 0)
            {
              player.x = 0;
            }
            if(player.y < 0)
            {
              player.y = 0;
            }
            if(player.x >= (config.gameSizeX - 10))
            {
              player.x = config.gameSizeX - 10;
            }
            if(player.y >= (config.gameSizeY - 10))
            {
              player.y = config.gameSizeY - 10;
            }
            if(player.x == player.newX && player.y == player.newY && player.bulletHit)
            {
                player.bulletHit = false;
                players.sendPlayerUpdate(player, config);
            }
        }
    }
    updateBullets(frametime);
}
function updateBullets(frametime)
{
    // update config.bullets
    for(i = 0; i < config.bullets.length; i++)
    {
        if(!config.bullets[i].alive)
        {
          continue;
        }
        config.bullets[i].x += ((config.bullets[i].velocity[0] * 10) * (frametime / 100));
        config.bullets[i].y += ((config.bullets[i].velocity[1] * 10) * (frametime / 100));
        // kill bullet if it is outside of canvas
        if(config.bullets[i].x > config.gameSizeX || config.bullets[i].x < 0 || config.bullets[i].y > config.gameSizeY || config.bullets[i].y < 0)
        {
            config.bullets[i].alive = false;
            config.io.sockets.in(config.bullets[i].room).emit("updateBullet", {id: config.bullets[i].id, x: config.bullets[i].x, y: config.bullets[i].y, alive: config.bullets[i].alive});
        }
        if(!config.bullets[i].alive)
        {
            config.bullets.splice(i, 1);
            continue;
        }
        var idx = players.getIdxForID(config.bullets[i].playerId, config);
        if(idx >= 0 && config.players.length > idx && !config.players[idx].monster)
        {
            var bullet_box = aabb([config.bullets[i].x, config.bullets[i].y], [5, 5]);
            for(p = 0; p < config.players.length; p++)
            {
                var player = config.players[p];
                if(player.id === config.bullets[i].playerId || !player.monster || !player.connected)
                {
                  continue;
                }
                var player_box = aabb([player.x - 10, player.y - 10], [30, 30]);
                if(bullet_box.intersects(player_box))
                {
                    //console.log('player hit ' + player.id);
                    // player hit!
                    player.newX = player.x + (config.bullets[i].velocity[0] * config.bulletPush);
                    player.newY = player.y + (config.bullets[i].velocity[1] * config.bulletPush);

                    if(player.newX < 0)
                    {
                      player.newX = 0;
                    }
                    if(player.newY < 0)
                    {
                      player.newY = 0;
                    }
                    if(player.newX >= config.gameSizeX)
                    {
                      player.newX = config.gameSizeX - 10;
                    }
                    if(player.newY >= config.gameSizeY)
                    {
                      player.newY = config.gameSizeY - 10;
                    }
                    player.bulletHit = true;
                    var upd = players.getPlayerUpdate(player);
                    if(upd !== undefined)
                    {
                        upd.attackerid = player.id;
                        config.io.sockets.emit("updatePlayer", upd);
                    }
                    else
                    {
                      console.log('couldnt sent update');
                    }
                    config.bullets[i].alive = false;
                    config.io.sockets.in(config.bullets[i].room).emit("updateBullet",
                    {
                      id: config.bullets[i].id, x: config.bullets[i].x, y: config.bullets[i].y, alive: config.bullets[i].alive
                    });
                    break;
                }
            }
        }
        if(!config.bullets[i].alive)
        {
            config.bullets.splice(i, 1);
            continue;
        }
    }
}
setInterval(updateWorld, 100);
config.io.on('connection', function (socket)
{
    var remoteAddress = (config.runningBehindProxy && socket.handshake.headers['x-forwarded-for']) || socket.request.connection.remoteAddress;
    // user joined the game / rejoined a room
    socket.on('joinRoom', function (msg)
    {
        var player = players.getPlayerForSocket(socket, config);
        if(msg.room !== 'public')
        {
          return;
        }
        if(!(config.rooms.indexOf(msg.room) > -1))
        {
            config.rooms.push(msg.room);
            config.gameStart.push(0);
            config.infectStart.push(0);
            config.infectEnd.push(0);
            config.lastImageChange.push(utils.getTime());
            config.lastImageUserChange.push(0);
            config.currentTime.push(utils.getHighResTime());
            var imgurid = config.defaultBackgrounds[math.randomInt(0, config.defaultBackgrounds.length - 1)];
            config.lastImage.push("http://i.imgur.com/" + imgurid + ".jpg");
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
                var pid = config.players.length + 1;
                console.log('new player at ID ' + pid + ', IP ' + remoteAddress + ', room ' + msg.room);
                var randX = math.randomInt(0, (config.gameSizeX / 10)) * 10;
                var randY = math.randomInt(0, (config.gameSizeY / 10)) * 10;
                var monst = config.infectStart[config.rooms.indexOf(msg.room)] > 0;
                players.addPlayer(pid, remoteAddress, msg.room, '', randX, randY, monst, socket, config);
                var timeleft = config.roundTimeLimit - (utils.getTime() - config.gameStart[config.rooms.indexOf(msg.room)]);
                if(timeleft < 0)
                {
                  timeleft = 0;
                }
                if(timeleft > config.roundTimeLimit)
                {
                  timeleft = config.roundTimeLimit;
                }
                socket.emit('gameState', {id: pid, session: config.sessionID, serverVersion: config.serverVersion, timeLeft: timeleft, x: config.gameSizeX, y: config.gameSizeY, speedPlayer: config.speedPlayer, speedMonster: config.speedMonster, image: config.lastImage[config.rooms.indexOf(msg.room)]});
                console.log('conns: ' + players.getConnCount(msg.room, config) + ' monsters: ' + zombies.getMonsterCount(msg.room, config));
            }
        }
        // send player list to client
        for(p = 0; p < config.players.length; p++)
        {
            if(config.players[p].room !== msg.room) continue;
            var upd = players.getPlayerUpdate(config.players[p]);
            if(upd !== undefined)
            {
                upd.x = config.players[p].x;
                upd.y = config.players[p].y;
                upd.absolute = true;
                socket.emit('newPlayer', upd);
                upd.x = config.players[p].newX;
                upd.y = config.players[p].newY;
                socket.emit('updatePlayer', upd);
            }
        }
        socket.emit('endPlayerList', true);
    });
    // some stuff copied from socket.on('position') and socket.on('joinRoom')
    socket.on('fireBullet', function (msg)
    {
        //console.log('Bullet fired by Player: ' + msg.id);
        if(msg.session !== config.sessionID || msg.id > config.players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        if(msg.x >= config.gameSizeX || msg.y >= config.gameSizeY)
        {
          return;
        }
        // Search through the config.players array for the player that fired the bullet
        var time = utils.getTime();
        for(p = 0; p < config.players.length; p++)
        {
            if(config.players[p].id !== msg.id)
                continue;
            if(config.players[p].ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + config.players[p].ip);
                break;
            }
            shottypes.fireBullet(config.players[p], msg.x, msg.y, config);
            break;
        }
    });
    socket.on('movement', function(msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== config.sessionID || msg.id > config.players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(player.id !== msg.id)
            {
              continue;
            }
            if(player.ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + player.ip);
                break;
            }
            player.moveRight = msg.moveRight;
            player.moveLeft = msg.moveLeft;
            player.moveUp = msg.moveUp;
            player.moveDown = msg.moveDown;
            players.sendPlayerUpdate(player, config);
            break;
        }
    });
    // usernames which are currently connected to the chat
var usernames = {};
var numUsers = 0;
 var addedUser = false;
  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data)
  {
    // we tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data
    });
  });
  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (username)
  {
    // we store the username in the socket session for this client
    socket.username = username;
    // add the client's username to the global list
    usernames[username] = username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined',
    {
      username: socket.username,
      numUsers: numUsers
    });
  });
  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', function ()
  {
    socket.broadcast.emit('typing',
    {
      username: socket.username
    });
  });
  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', function ()
  {
    socket.broadcast.emit('stop typing',
    {
      username: socket.username
    });
  });
  // when the user disconnects.. perform this
  socket.on('disconnect', function ()
  {
    // remove the username from global usernames list
    if (addedUser)
    {
      delete usernames[socket.username];
      --numUsers;
      // echo globally that this client has left
      socket.broadcast.emit('user left',
      {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
    socket.on('position', function (msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== config.sessionID || msg.id > config.players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        // if position is out of bounds
        if(msg.x >= config.gameSizeX || msg.y >= config.gameSizeY)
        {
          return;
        }
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(player.id !== msg.id)
            {
              continue;
            }
            if(player.ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + player.ip);
                break;
            }
            //if(player.bulletHit) // don't move if we've been hit
            //    break;
            player.newX = msg.x;
            player.newY = msg.y;
            players.sendPlayerUpdate(player, config);
            break;
        }
    });
    socket.on('updateImage', function(msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== config.sessionID || msg.id > config.players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        var player = players.getPlayerForSocket(socket, config);
        if(player === undefined)
        {
          return;
        }
        var time = utils.getTime();
        var roomidx = config.rooms.indexOf(player.room);
        var validImage = (time - config.lastImageUserChange[roomidx] >= config.imageChangeCooldown);
        if((validImage || remoteAddress == "127.0.0.1" || remoteAddress == "localhost") && msg.src.length > 5 && (msg.src.substring(0, 5) === "http:" || msg.src.substring(0, 5) === "data:"))
        {
            socket.broadcast.to(player.room).emit('updateImage', msg);
            socket.emit('updateImage', msg);
            config.lastImageUserChange[roomidx] = time;
            config.lastImage[roomidx] = msg.src;
            console.log('image changed by player ' + msg.id + ' to ' + msg.src);
        }
    });
    socket.on('username', function(msg)
    {
        // if session is different or player id is invalid
        if(msg.session !== config.sessionID || msg.id > config.players.length)
        {
            socket.emit('refresh', {time:'now'});
            return;
        }
        if(msg.username === undefined)
        {
          return;
        }
        var time = utils.getTime();
        var name = msg.username;
        if(name.length > config.nameSizeLimit)
        {
          name = name.substring(0, config.nameSizeLimit);
        }
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(player.id !== msg.id)
            {
              continue;
            }
            if(player.ip !== remoteAddress)
            {
                console.log('attempted hack into unowned player, ip: ' + remoteAddress + ' expected ' + player.ip);
                break;
            }
            if(player.lastNameChange == 0 || time - player.lastNameChange >= 30)
            {
                player.lastNameChange = time;
            }
            //else
            //    break;
            player.username = name;
            players.sendPlayerUpdate(player, config);
            break;
        }
    });
    socket.on('changeSettings', function(msg)
    {
        if(config.serverPassword === "default")
        {
            console.log('no password.txt file found, disallowing admin command!');
            return;
        }
        if(msg.password === undefined || msg.password !== config.serverPassword)
        {
            console.log('attempted hack into admin command, ip: ' + remoteAddress);
            return;
        }
        if(msg.x !== undefined)
        {
          config.gameSizeX = msg.x;
        }
        if(msg.y !== undefined)
        {
          config.gameSizeY = msg.y;
        }
        if(msg.speedPlayer !== undefined)
        {
          config.speedPlayer = msg.speedPlayer;
        }
        if(msg.speedMonster !== undefined)
        {
          config.speedMonster = msg.speedMonster;
        }
        if(msg.speedBullet !== undefined)
        {
          config.speedBullet = msg.speedBullet;
        }
        if(msg.botLower !== undefined)
        {
          config.botWaitLimitLower = msg.botLower;
        }
        if(msg.botUpper !== undefined)
        {
          config.botWaitLimitUpper = msg.botUpper;
        }
        if(msg.bulletPush !== undefined)
        {
          config.bulletPush = msg.bulletPush;
        }
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(!player.connected || player.iosock === undefined)
            {
              continue;
            }
            player.iosock.emit('gameState', {id: player.id, session: config.sessionID, x: config.gameSizeX, y: config.gameSizeY, speedPlayer: config.speedPlayer, speedMonster: config.speedMonster, image: config.lastImage[config.rooms.indexOf(player.room)]});
            // todo: fix this, it should move out of bound config.players back into the game for when the game is resized
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
                var upd = players.getPlayerUpdate(player);
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
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(player.iosock !== socket)
            {
              continue;
            }
            player.connected = false;
            players.sendPlayerUpdate(player, config);
            console.log('player ' + player.id + ' disconnected');
            console.log('conns: ' + players.getConnCount(player.room, config) + ' monsters: ' + zombies.getMonsterCount(player.room, config));
            break;
        }
    });
});
