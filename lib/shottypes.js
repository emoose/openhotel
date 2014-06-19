var math = require('./math')
    , utils = require('./utils');

//==========================================================================================
// Generates a single bullet object containing x, y coords and a velocity
// Requires a player and target object both containing `x` and `y` properties
// [Optional]: speedBullet - Float that multiplies the speed of the bullet
function genSingleBullet(player, target, speedBullet)
{
    var speedMultiplier = 1;
    if(speedBullet !== undefined)
    {
        speedMultiplier = speedBullet;
    }
    var originX = player.x + 5;
    var originY = player.y + 5;
    var velocity = math.normalize(target.x - originX, target.y - originY);
    velocity[0] = velocity[0] * speedMultiplier;
    velocity[1] = velocity[1] * speedMultiplier;
    return {x: originX, y: originY, velocity: velocity};
}

// Returns color if defined, otherwise defaults to "#FF3399" (purple) or some specified default arg
// [Optional]: defaultColor - Color Hex Code String to fallback on if main color arg undefined
function genColor(color, defaultColor)
{
    if(color === undefined)
    {
        if(defaultColor === undefined)
            return "#FF3399"
        else
            return defaultColor
    }
    else
        return color
}

//------------------------------------------------------------------------------------------
// All Shot type arguments require:
// player      - Object containing a player's `x`, `y`, `id` and `room` properties
// target      - Object containing `x`, `y` properties which shot will aim at
// id          - Object containing an `id` property which should be unique for each bullet
//               (id will be incremented differently depending on each shot)
//
// Optional arguments (provided in the object argument: `optional`) include:
// speedBullet - Float that multiplies the speed of all bullets generated
// color       - String containing color Hex Code to color some/all bullet(s) of shot
//
// Additional optional args are noted in comments above the function, prefixed with `[Optional]:`
//------------------------------------------------------------------------------------------
//
// All Shot type functions return an array of bullet objects with the follow properties:
// { id, playerId, x, y, velocity, color, alive, room }
//
// It's the job of the application to broadcast/emit these bullets

// Desc: Fires a single shot in the direction of target's `x` and `y` coords
// Increments id by 1
var singleShot = function(player, target, config, optional)
{
    var color = genColor(optional.color);
    var b     = genSingleBullet(player, target, optional.speedBullet);
    var shot  = [{id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: b.velocity, color: color, alive: true, room: player.room}];
    config.bulletId++;

    return shot;
};

// Desc: Fires a spread of 3 shots in the direction of target's `x` and `y` coords
// [Optional]: customAngle - Float angle arg to specify the spread angle
// Increments id by 3
var tripleShot = function(player, target, config, optional)
{
    var spreadAngle = 3;
    if(customAngle !== undefined)
        spreadAngle = optional.customAngle;

    var color = genColor(optional.color);
    var b     = genSingleBullet(player, target, optional.speedBullet);
    var shot  = [{id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: b.velocity, color: color, alive: true, room: player.room}];
    config.bulletId++;

    // Generate two more bullets to add to shot, rotated + and - spreadAngle
    var velocity2 = math.rotate(b.velocity, spreadAngle);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: velocity2, color: color, alive: true, room: player.room});
    config.bulletId++;

    var velocity3 = math.rotate(b.velocity, -spreadAngle);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: velocity3, color: color, alive: true, room: player.room});
    config.bulletId++;

    return shot;
}

// Desc: A broken shot, something to mess around with
// Increments id by 6
var brokenShot = function(player, target, config, optional)
{
    var color = genColor(optional.color);
    var b = genSingleBullet(player, target, optional.speedBullet);
    var shot = [{id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: b.velocity, color: color, alive: true, room: player.room}];
    config.bulletId++;

    var spreadAngle = 5;
    // Generate two more bullets to add to shot, rotated + and - spreadAngle
    var velocity2 = math.rotate(b.velocity, spreadAngle);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: velocity2, color: color, alive: true, room: player.room});
    config.bulletId++;

    var velocity3 = math.rotate(b.velocity, -spreadAngle);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: velocity3, color: color, alive: true, room: player.room});
    config.bulletId++;

    // Generate three more bullets to add to shot at 90 degrees around player
    var left = math.rotate(b.velocity, -90);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: left, color: color, alive: true, room: player.room});
    config.bulletId++;

    var behind = math.rotate(b.velocity, 180);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: behind, color: color, alive: true, room: player.room});
    config.bulletId++;

    var right = math.rotate(b.velocity, 90);
    shot.push({id: config.bulletId, playerId: player.id, x: b.x, y: b.y, velocity: right, color: color, alive: true, room: player.room});
    config.bulletId++;

    return shot;
}

module.exports =
{
    singleShot: singleShot,
    tripleShot: tripleShot,
    brokenShot: brokenShot,
    
    fireBullet: function(player, targetX, targetY, config)
    {
        var time = utils.getTime();
        if(player.firstFire === undefined || player.firstFire === 0)
            player.firstFire = time;
        else if(time - player.firstFire >= 2)
        {
            player.firstFire = 0;
            player.fireCount = 0;
        }
        if(player.fireCount !== undefined && player.fireCount > 10)
            return;

        player.fireCount++;

        // To change which shot is being used, simply call a different shot function, eg tripleShot()
        // (you should even be able to provide the same arguments)
        // Example of using the optional color arg to specify shot color
        // (internally, we don't even have to use this val for all bullets of the shot)
        var shot = singleShot(player, {x: targetX, y: targetY}, config, {speedBullet: config.speedBullet, color: "#0000FF"});

        for(i = 0; i < shot.length; i++)
        {
            // Push bullet into array, have it keep track of its own room and emit the bullet to room that spawned it
            //
            // At the moment every bullet gets a unique id from a basic incrementing counter, I don't think it'll overflow
            // but if it ever comes to it, we can just keep an array to store id values that can be recycled and reuse those
            config.bullets.push(shot[i]);
            config.io.sockets.in(player.room).emit('newBullet', shot[i]);
        }
    },
};