'use strict';

/*
 * 游戏逻辑 
*/

// 检查`Date.now()`是否存在，如果不存在则添加一个返回当前时间戳的方法
if (!Date.now) {
    Date.now = function () {
        return new Date().getTime();
    };
}

// 创建一个匿名函数并立刻执行
(function () {
    'use strict';

    // 如果requestAnimationFrame存在则使用它，否则使用setTimeout
    if (window.requestAnimationFrame && window.cancelAnimationFrame) {
        return;
    }

    // 对于不支持requstAnimationFrame的浏览器，使用setTimeout模拟
    window.requestAnimationFrame = function (callback) {
        var currentTime = Date.now();
        var delay = Math.max(0, 16 - (currentTime - lastTime));
        lastTime = currentTime + delay;
        return setTimeout(function () { callback(lastTime); }, delay);
    };

    // 对于不支持cancelAnimationFrame的浏览器，使用clearTimeout模拟
    window.cancelAnimationFrame = function (id) {
        clearTimeout(id);
    };
})();

// 通过ES6的class语法创建游戏类
class Game {
    constructor(id, params) {
        // 初始化设置对象
        this.width = 960;
        this.height = 640;
        this.params = params;
    }
}