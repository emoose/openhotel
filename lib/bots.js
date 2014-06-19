var math = require('./math')
    , utils = require('./utils')
    , players = require('./players')
    , shottypes = require('./shottypes')
    , zombies = require('./gametypes/zombies');

var getBotsForRoom = function(room, config)
{
    var roombots = [];
    for(b=0; b<config.bots.length; b++)
    {
        if(config.players[config.bots[b].playeridx].room !== room) continue;

        roombots.push(config.bots[b]);
    }
    return roombots;
};

var botRetarget = function(bot, config)
{
    var player = config.players[bot.playeridx];
// lets choose a target
    var targetidx = players.getClosestPlayerIdx(player, 'human', config);
    var randX = player.newX;
    var randY = player.newY;
    if(targetidx >= 0)
    {
        var targetplayer = config.players[targetidx];
        randX = targetplayer.x;
        randY = targetplayer.y;
    }
    else
    {
        if(randX == player.x && randY == player.y)
        {
            randX = math.randomInt(0, Math.floor(config.gameSizeX / 10)) * 10;
            randY = math.randomInt(0, Math.floor(config.gameSizeY / 10)) * 10;
        }
    }
    bot.targetidx = targetidx;
    if(randX != player.newX || randY != player.newY)
    {
        player.newX = randX;
        player.newY = randY;
        players.sendPlayerUpdate(player, config);
    }
    if(targetidx >= 0)
        bot.status = 'attack';
};

var update = function(room, config)
{
    var time = utils.getTime();
    var roombots = getBotsForRoom(room, config);
    if(roombots.length <= 0)
    {
        // spawn some config.bots
        console.log('spawning config.bots');
        for(b=0; b<10;b++)
        {
            var randX = math.randomInt(0, (config.gameSizeX / 10)) * 10;
            var randY = math.randomInt(0, (config.gameSizeY / 10)) * 10;
            var pid = config.players.length + 1;
            
            var botplayer = players.addPlayer(pid, "127.0.0.1", room, "", randX, randY, false, undefined, config);
            
            config.bots.push({playeridx: config.players.length - 1, targetidx: -1, status: 'think', timer: 0, lastType: 'human', lastShot: 0});
            console.log('bot spawned, stats: ', botplayer, config.bots[config.bots.length - 1]);
        }
        roombots = getBotsForRoom(room, config);
    }

    for(b=0; b<roombots.length; b++)
    {
        var bot = roombots[b];
        var player = config.players[bot.playeridx];
        if(!player.monster || zombies.getMonsterCount(room, config) >= players.getConnCount(room, config))
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
                    var randX = math.randomInt(0, Math.floor(config.gameSizeX / 10)) * 10;
                    var randY = math.randomInt(0, Math.floor(config.gameSizeY / 10)) * 10;

                    player.newX = randX;
                    player.newY = randY;
                    players.sendPlayerUpdate(player, config);
                    //bot.status = 'attack';
                }
                //else
                //    console.log('bot thinking... ', player.id, curXtile, destXtile, curYtile, destYtile);
            //}
            var hrtime = utils.getHighResTime();
            if(!player.monster && (hrtime - bot.lastShot >= 300))
            {
                // fire a bullet at the closest monster
                var targetidx = players.getClosestPlayerIdx(player, 'monster', config);
                if(targetidx < 0)
                    continue;

                var target = config.players[targetidx];
                shottypes.fireBullet(player, target.x, target.y, config);
                bot.lastShot = hrtime;
            }
        }
        else
        {
            if(bot.lastType === 'human')
            {
                if(bot.timer !== 0 && time - bot.timer >= math.randomInt(config.botWaitLimitLower, config.botWaitLimitUpper))
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
                        players.sendPlayerUpdate(player, config);
                    }

                    continue;
                }
            }
            if(bot.status === 'think')
            {
                botRetarget(bot, config);
            }
            else if(bot.status === 'attack' && bot.targetidx >= 0)
            {
                if(players.getClosestPlayerIdx(player, 'human', config) !== bot.targetidx)
                {
                    bot.status = 'think';
                    continue;
                }
                var targetplayer = config.players[bot.targetidx];
                if(!targetplayer.connected || targetplayer.monster)
                {
                    bot.status = 'think';
                    bot.targetidx = -1;
                    player.newX = player.x;
                    player.newY = player.y;
                    players.sendPlayerUpdate(player, config);
                    //console.log('bot ', bot, ' is going to sit and think');
                }
                else
                {
                    if(player.newX != targetplayer.x || player.newY != targetplayer.y)
                    {
                        if(player.bulletHit && bot.timer === 0)
                            bot.timer = time;
                        else if(!player.bulletHit || time - bot.timer >= math.randomInt(config.botWaitLimitLower, config.botWaitLimitUpper))
                        {
                            player.newX = targetplayer.x;
                            player.newY = targetplayer.y;
                            players.sendPlayerUpdate(player, config);
                            bot.timer = 0;
                            player.bulletHit = false;
                        }
                    }
                }
            }
        }
    }
};

module.exports =
{
    getBotsForRoom: getBotsForRoom,
    botRetarget: botRetarget,
    update: update
};