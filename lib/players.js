var getDistanceBetweenPlayers = function(player1, player2)
{
    var xd = player1.x-player2.x;
    var yd = player1.y-player2.y;
    return Math.abs(Math.sqrt(xd*xd + yd*yd));
};

var getPlayerUpdate = function(player)
{
    if(player !== undefined)
        return { id: player.id, username: player.username, x: player.newX, y: player.newY, monster: player.monster, connected: player.connected, moveRight: player.moveRight, moveLeft: player.moveLeft, moveUp: player.moveUp, moveDown: player.moveDown, bulletHit: player.bulletHit };
    return undefined;
};

var getConnCount = function(room, config)
{
    var count = 0;
    for(p = 0; p < config.players.length; p++)
    {
        if(!config.players[p].connected || config.players[p].room !== room)
            continue;
        count++;
    }
    return count;
};

var getConnectedHumans = function(room, config)
{
    var valid = [];
    for(p = 0; p < config.players.length; p++)
    {
        if(!config.players[p].connected || config.players[p].monster || config.players[p].room !== room)
            continue;
        valid.push(config.players[p]);
    }
    return valid;
}

var addPlayer = function(pid, ip, room, username, x, y, monster, iosocket, config)
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
        bulletHit: false,
        iosock: iosocket
    };

    config.players.push(player);
    config.io.sockets.in(room).emit('newPlayer', {id: pid, username: username, x: x, y: y, monster: monster, connected: true});

    return player;
};

var sendPlayerUpdate = function(player, config)
{
    var upd = getPlayerUpdate(player);
    if(upd !== undefined)
        config.io.sockets.in(player.room).emit('updatePlayer', upd);
};

var getIdxForID = function(playerid, config)
{
    for(p = 0; p < config.players.length; p++)
    {
        if(config.players[p].id !== playerid)
            continue;
        return p;
    }
    return -1;
};

var getPlayerForSocket = function(socket, config)
{
    for(p = 0; p < config.players.length; p++)
    {
        if(config.players[p].iosock !== socket) continue;
        return config.players[p];
    }
    return undefined;
};

var getBotForPlayer = function(player, config)
{
    if(player.iosock !== undefined) return false;
    for(b=0; b<config.bots.length; b++)
    {
        if(config.players[config.bots[b].playeridx].id === player.id)
            return config.bots[b];
    }
    return false;
};

var getClosestPlayerIdx = function(player, type, config)
{
    var targetdistance = 9999999999;
    var targetidx = -1;
    if(type !== 'human' && type !== 'monster')
        return targetidx;

    for(p=0; p<config.players.length; p++)
    {
        if((type === 'human' && config.players[p].monster) || (type === 'monster' && !config.players[p].monster) || config.players[p].room !== player.room || !config.players[p].connected)
            continue;
        var dist = getDistanceBetweenPlayers(player, config.players[p]);
        if(targetdistance > dist)
        {
            targetidx = p;
            targetdistance = dist;
           // console.log('bot ' + player.id + ' chose player ' + players[targetidx].id, players[targetidx].username);
        }
    }
    return targetidx;
};

module.exports =
{
    getConnCount: getConnCount,
    getConnectedHumans: getConnectedHumans,
    addPlayer: addPlayer,    
    getPlayerUpdate: getPlayerUpdate,
    sendPlayerUpdate: sendPlayerUpdate,
    getIdxForID: getIdxForID,
    getPlayerForSocket: getPlayerForSocket,
    getBotForPlayer: getBotForPlayer,
    getDistanceBetweenPlayers: getDistanceBetweenPlayers,
    getClosestPlayerIdx: getClosestPlayerIdx
};