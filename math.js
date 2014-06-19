var magnitude = function(x, y)
{
    return Math.sqrt(x*x + y*y);
};

function radians(degrees)
{
    return degrees * (Math.PI / 180);
}

// vectors are in the form of a 2 element array: [x, y]
module.exports =
{
    magnitude: magnitude,

    normalize: function (x, y)
    {
        var len = magnitude(x, y);
        if (len > 0) {
            return [x/len, y/len];
        } else {
            return [x, y]
        }
    },

    // returns a new vector rotated around 0,0
    rotate: function (vector, angle)
    {
        var theta = radians(angle);
        var c = Math.cos(theta);
        var s = Math.sin(theta);
        return [vector[0] * c - vector[1] * s, vector[0] * s + vector[1] * c];
    },

    // returns a new vector with the new magnitude
    newMagnitude: function(vector, mag)
    {
        var current = magnitude(vector[0], vector[1]);
        var r = mag / current;
        return [vector[0] * r, vector[1] * r];
    },

    randomInt: function(low, high)
    {
        return Math.floor(Math.random() * (high - low) + low);
    },
};