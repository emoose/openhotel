module.exports =
{
    getTime: function()
    {
        return Math.round(+new Date()/1000);
    },
    
    getHighResTime: function()
    {
        return (+new Date());
    }
};