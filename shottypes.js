var math = require('./math');

//================================================================================
// Generates a single bullet object containing x, y coords and a velocity
// Requires a player and target object both containing `x` and `y` properties
function genSingleBullet(player, target, speedBullet)
{

    var originX = player.x + 5;
    var originY = player.y + 5;
    var velocity = math.normalize(target.x - originX, target.y - originY);
    velocity[0] = velocity[0] * speedBullet;
    velocity[1] = velocity[1] * speedBullet;
    return {x: originX, y: originY, velocity: velocity};
}

//--------------------------------------------------------------------------------
// All Shot type arguments require:
// player      - Object containing a player's `x`, `y`, `id` and `room` properties
// target      - Object containing `x`, `y` properties which shot will aim at
// id          - Object containing an `id` property which should be unique for each bullet
//               (id will be incremented differently depending on each shot)
// speedBullet - Float that multiplies the speed of all bullets generated
//
// All Shot type functions return an array of bullet objects with the follow properties:
// { id, playerId, x, y, velocity, alive, room }
//
// It's the job of the application to broadcast/emit these bullets

// Desc: Fires a single shot in the direction of target's `x` and `y` coords
// Increments id by 1
var singleShot = function(player, target, id, speedBullet)
{
    var b = genSingleBullet(player, target, speedBullet);
    var shot = [{id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: b.velocity, alive: true, room: player.room}];
    id.id++;

    return shot;
};

// Desc: Fires a spread of 3 shots in the direction of target's `x` and `y` coords
// [Optional] Float angle arg to specify the spread angle
// Increments id by 3
var tripleShot = function(player, target, id, speedBullet, customAngle)
{
    var spreadAngle = 3;
    if(customAngle !== undefined)
        spreadAngle = customAngle;

    var b = genSingleBullet(player, target, speedBullet);
    var shot = [{id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: b.velocity, alive: true, room: player.room}];
    id.id++;

    // Generate two more bullets to add to shot, rotated + and - spreadAngle
    var velocity2 = math.rotate(b.velocity, spreadAngle);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: velocity2, alive: true, room: player.room});
    id.id++;

    var velocity3 = math.rotate(b.velocity, -spreadAngle);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: velocity3, alive: true, room: player.room});
    id.id++;

    return shot;
}

// Desc: A broken shot, something to mess around with
// Increments id by 6
var brokenShot = function(player, target, id, speedBullet)
{
    var b = genSingleBullet(player, target, speedBullet);
    var shot = [{id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: b.velocity, alive: true, room: player.room}];
    id.id++;

    var spreadAngle = 5;
    // Generate two more bullets to add to shot, rotated + and - spreadAngle
    var velocity2 = math.rotate(b.velocity, spreadAngle);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: velocity2, alive: true, room: player.room});
    id.id++;

    var velocity3 = math.rotate(b.velocity, -spreadAngle);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: velocity3, alive: true, room: player.room});
    id.id++;

    // Generate three more bullets to add to shot at 90 degrees around player
    var left = math.rotate(b.velocity, -90);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: left, alive: true, room: player.room});
    id.id++;

    var behind = math.rotate(b.velocity, 180);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: behind, alive: true, room: player.room});
    id.id++;

    var right = math.rotate(b.velocity, 90);
    shot.push({id: id.id, playerId: player.id, x: b.x, y: b.y, velocity: right, alive: true, room: player.room});
    id.id++;

    return shot;
}

module.exports =
{
    singleShot: singleShot,
    tripleShot: tripleShot,
    brokenShot: brokenShot,
};