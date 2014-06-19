var aabb = require('aabb-2d')
    , math = require('../math')
    , utils = require('../utils')
    , players = require('../players');

var update = function(room, config)
{
    var monsterCount = getMonsterCount(room, config);
    var connCount = players.getConnCount(room, config);
    
    var r = config.rooms.indexOf(room);
    if(r < 0)
        return;

    var time = utils.getTime();
    
    // monsters win
    if(monsterCount >= connCount && config.infectEnd[r] <= 0)
    {
        config.infectEnd[r] = time;
        console.log('monsters win @ ' + time + ' room ' + room);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
    }

    // humans win
    if(connCount > monsterCount && config.infectEnd[r] <= 0 && config.gameStart[r] > 0 && time - config.gameStart[r] >= config.roundTimeLimit)
    {
        config.infectEnd[r] = time;
        console.log('humans win @ ' + time + ' room ' + room);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        config.io.sockets.in(room).emit("roundEnd", {id: 0, victimid: 0});
    }

    if(config.infectEnd[r] > 0 && (time - config.infectEnd[r]) >= 5)
    {
        for(p = 0; p < config.players.length; p++)
        {
            var player = config.players[p];
            if(!player.connected || !player.monster || player.room !== room)
                continue;
            player.monster = false;
            players.sendPlayerUpdate(player, config);
        }
        config.gameStart[r] = 0;
        config.infectStart[r] = 0;
        config.infectEnd[r] = 0;
        console.log('round reset @ ' + time + ' room ' + room);
        console.log('conns: ' + connCount + ' monsters: ' + getMonsterCount(room, config));
    }
    if(connCount >= 2 && config.gameStart[r] <= 0)
    {
        config.gameStart[r] = time;
        console.log('round start @ ' + time + ' room ' + room);
        console.log('conns: ' + connCount + ' monsters: ' + monsterCount);
        config.io.sockets.in(room).emit("roundStart", {timeLimit: config.roundTimeLimit});
    }
    if(connCount >= 2 && config.gameStart[r] > 0 && config.infectStart[r] <= 0 && (time - config.gameStart[r]) >= 15)
    {
        // we have 2 or more config.players and 30 seconds has passed
        // infect one of them randomly
        config.infectStart[r] = time;
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
            infectRandomPlayer(room, config);
    }

    for(p = 0; p < config.players.length; p++)
    {
        var player = config.players[p];
        if(!player.monster || !player.connected) continue;

        var zombie_box = aabb([player.x - 10, player.y - 10], [30, 30]);

        for(py = 0; py < config.players.length; py++)
        {
            var testPlayer = config.players[py];
            if(testPlayer.monster || testPlayer.id == player.id || testPlayer.room !== player.room)
                continue;

            var player_box = aabb([testPlayer.x, testPlayer.y], [10, 10]);
            
            if(zombie_box.intersects(player_box))
            {
                testPlayer.monster = true;
                var upd = players.getPlayerUpdate(testPlayer);
                console.log('player ' + player.id + ' infected player ' + testPlayer.id);
                console.log('conns: ' + players.getConnCount(player.room, config) + ' monsters: ' + getMonsterCount(player.room, config));
                if(upd !== undefined)
                {
                    upd.attackerid = player.id;
                    config.io.sockets.to(player.room).emit("updatePlayer", upd);
                }
                if(getMonsterCount(player.room, config) >= players.getConnCount(player.room, config) && config.infectEnd[config.rooms.indexOf(player.room)] <= 0)
                    config.io.sockets.in(player.room).emit("roundEnd", {id: player.id, victimid: upd.id});
            }
        }
    }
};

var infectRandomPlayer = function(room, config)
{
    if(config.players.length <= 0 || players.getConnCount(room, config) <= 0)
        return;

    var valid = players.getConnectedHumans(room, config);
    if(valid.length <= 0)
        return;

    var infectid = math.randomInt(0, valid.length);

    valid[infectid].monster = true;
    console.log('infecting player ' + infectid);
    console.log('conns: ' + players.getConnCount(room, config) + ' monsters: ' + getMonsterCount(room, config));

    players.sendPlayerUpdate(valid[infectid], config);
};

var getMonsterCount = function(room, config)
{
    var count = 0;
    for(p = 0; p < config.players.length; p++)
    {
        if(!config.players[p].connected || !config.players[p].monster || config.players[p].room !== room)
            continue;
        count++;
    }
    return count;
};

module.exports = 
{
    update: update,
    infectRandomPlayer: infectRandomPlayer,
    getMonsterCount: getMonsterCount
};