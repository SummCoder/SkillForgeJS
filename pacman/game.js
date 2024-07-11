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

// 活动对象类
class Item {
    // 构造函数
    constructor(params = {}) {
        this._params = params;
        this._id = 0;       // 标识符
        this._stage = null; // 所属舞台
        this._settings = {
            x: 0,					// 位置坐标:横坐标
            y: 0,					// 位置坐标:纵坐标
            width: 20,				// 宽
            height: 20,				// 高
            type: 0,				// 对象类型,0表示普通对象(不与地图绑定),1表示玩家控制对象,2表示程序控制对象
            color: '#F00',			// 标识颜色
            status: 1,				// 对象状态,0表示未激活/结束,1表示正常,2表示暂停,3表示临时,4表示异常
            orientation: 0,			// 当前定位方向,0表示右,1表示下,2表示左,3表示上
            speed: 0,				// 移动速度
            location: null,			// 定位地图,Map对象
            coord: null,			// 如果对象与地图绑定,需设置地图坐标;若不绑定,则设置位置坐标
            path: [],				// NPC自动行走的路径
            vector: null,			// 目标坐标
            frames: 1,				// 速度等级,内部计算器times多少帧变化一次
            times: 0,				// 刷新画布计数(用于循环动画状态判断)
            timeout: 0,				// 倒计时(用于过程动画状态判断)
            control: {},			// 控制缓存,到达定位点时处理
            update: () => {}, 	 	// 更新参数信息
            draw: () => {}		    // 绘制
        };
        Object.assign(this, this._settings, this._params);
    }

    bind(eventType, callback) {
        if (!Game._events[eventType]) { 
            Game._events[eventType] = {};
            Game._canvas.addEventListener(eventType, (e) => {
                var position = Game.getPosition(e);
                Game._stages[Game._index].items.forEach((item) => {
                    if (item.x <= position.x && position.x <= item.x + item.width
                        && item.y <= position.y && position.y <= item.y + item.height
                    ) {
                        const key = 's' + Game._index + 'i' + item._id;
                        if (Game._events[eventType][key]) {
                            Game._events[eventType][key](e);
                        }
                    }
                });
                e.preventDefault();
            });
        }
        const key = 's' + this._stage.index + 'i' + this._id;
        Game._events[eventType][key] = callback.bind(this);     // 绑定作用域
    }
}

// Map地图对象
class Map {
    // 构造函数
    constructor(params = {}) {
        this._params = params;
        this._id = 0;       // 标识符
        this._stage = null; // 绑定舞台类
        this._settings = {
            x:0,					//地图起点坐标
            y:0,
            size:20,				//地图单元的宽度
            data:[],				//地图数据
            x_length:0,				//二维数组x轴长度
            y_length:0,				//二维数组y轴长度
            frames:1,				//速度等级,内部计算器times多少帧变化一次
            times:0,				//刷新画布计数(用于循环动画状态判断)
            cache:false,    		//是否静态（如静态则设置缓存）
            update: () => {},	//更新地图数据
            draw: () => {},		//绘制地图
        };
        Object.assign(this, this._settings, this._params);
    }

    // 获取地图上某点的值
    get(x, y) {
        // 判断 this.data[y] 是否存在且 this.data[y][x] 不是 undefined
        if (this.data[y] && typeof this.data[y][x] !== 'undefined') {
            // 返回 this.data[y][x] 的值
            return this.data[y][x];
        }
        // 如果不满足条件，则返回 -1
        return -1;
    }

    // 设置地图上某点的值
    set(x, y, value) {
        if (this.data[y]) {
            this.data[y][x] = value;
        }
    }

    // 地图坐标转画布坐标
    coord2position(cx, cy) {
        return {
            x: this.x + cx * this.size + this.size / 2,
            y: this.y + cy * this.size + this.size / 2
        };
    }

    // 画布坐标转地图坐标
    position2coord(x, y) {
        const fx = Math.abs(x - this.x) % this.size - this.size / 2;
        const fy = Math.abs(y - this.y) % this.size - this.size / 2;
        return {
            x: Math.floor((x - this.x) / this.size),
            y: Math.floor((y - this.y) / this.size),
            offset: Math.sqrt(fx * fx + fy * fy)
        };
    }

    // 寻址算法
    finder(params) {
        const defaults = {
            map: null,
            start: {},
            end: {},
            type: 'path'
        };
        const options = Object.assign({}, defaults, params);
        if (options.map[options.start.y][options.start.x] || options.map[options.end.y][options.end.x]) {   // 起点或终点是障碍物
            return [];
        }
        let finded = false;
        let result = [];
        const y_length = options.map.length;
        const x_length = options.map[0].length;      
        const steps = Array(y_length).fill(0).map(() => Array(x_length).fill(0));   // 步骤的映射
        // 获取地图上的值
        const _getValue = (x, y) => {
            if (options.map[y] && typeof options.map[y][x] !== 'undefined') {
                return options.map[y][x];
            }
            return -1;
        };

        // 判断是否可走，可走放入列表
        const _next = (to) => {
            // 获取目标位置的值
            const value = _getValue(to.x, to.y);
            // 如果值小于1
            if (value < 1) {
                // 如果值等于-1
                if (value === -1) {
                    // 对x坐标进行取模运算，实现循环
                    to.x = (to.x + x_length) % x_length;
                    // 对y坐标进行取模运算，实现循环
                    to.y = (to.y + y_length) % y_length;
                    // 标记变化为1
                    to.change = 1;
                }
                // 如果目标位置未被访问过
                if (!steps[to.y][to.x]) {
                    // 将目标位置添加到结果数组中
                    result.push(to);
                }
            }
        }

        // 开始寻路
        const _render = (list) => {
            var new_list = [];
            var next = (from, to) => {
                const value = _getValue(to.x, to.y);
                if (value < 1) {    // 当前点是否可以走
                    if (value === -1) {
                        to.x = (to.x + x_length) % x_length;
                        to.y = (to.y + y_length) % y_length;
                    }
                    if (to.x === options.end.x && to.y === options.end.y) {
                        steps[to.y][to.x] = from;
                        finded = true;
                    } else if (!steps[to.y][to.x]) {
                        steps[to.y][to.x] = from;
                        new_list.push(to);
                    }
                }
            };

            list.forEach((current) => {
                next(current, {
                    y: current.y + 1, 
                    x: current.x
                });
                next(current, {
                    y: current.y,
                    x: current.x + 1
                });
                next(current, {
                    y: current.y - 1,
                    x: current.x
                });
                next(current, {
                    y: current.y,
                    x: current.x - 1
                })
            });

            if (!finded && new_list.length) {
                _render(new_list);
            }
        };

        _render([options.start]);

        if (finded) {
            let current = options.end;
            if (options.type === 'path') {
                while(current.x !== options.start.x || current.y !== options.start.y) {
                    result.unshift(current);
                    current = steps[current.y][current.x];
                }
            } else if(options.type === 'next'){
                _next({x:current.x+1,y:current.y});
                _next({x:current.x,y:current.y+1});
                _next({x:current.x-1,y:current.y});
                _next({x:current.x,y:current.y-1});
            }
        }
        return result;
    }
}

// 舞台类
class Stage {
    constructor(params = {}) {
        this._params = params;
        this._settings = {
            index:0,                        //布景索引
            status:0,						//布景状态,0表示未激活/结束,1表示正常,2表示暂停,3表示临时状态
            maps:[],						//地图队列
            audio:[],						//音频资源
            images:[],						//图片资源
            items:[],						//对象队列
            timeout:0,						//倒计时(用于过程动画状态判断)
            update: () => {}				//嗅探,处理布局下不同对象的相对关系
        };
        Object.assign(this, this._settings, this._params);
    }

    // 添加对象
    createItem(options) {
        var item = new Item(options);
        // 动态属性
        if (item.location) {
            Object.assign(item, item.location.coord2position(item.coord.x, item.coord.y));
        }
        // 关系绑定
        item._stage = this;
        item._id = this.items.length;
        this.items.push(item);
        return item;
    }

    // 重置物品位置
    resetItems() {
        this.status = 1;
        this.items.forEach((item) => {
            Object.assign(item, item._settings, item._params);
            if (item.location) {
                Object.assign(item, item.location.coord2position(item.coord.x, item.coord.y));
            }
        });
    }

    // 获取对象列表
    getItemsByType(type) {
        return this.items.filter((item) => {
            return item.type === type;
        });
    }

    // 添加地图
    createMap(options) {
        var map = new Map(options);
        // 动态属性
        map.data = JSON.parse(JSON.stringify(map._params.data));
        map.y_length = map.data.length;
        map.x_length = map.data[0].length;
        // 关系绑定
        map._stage = this;
        map._id = this.maps.length;
        this.maps.push(map);
        return map;
    }

    // 重置地图
    resetMaps() {
        this.status = 1;
        this.maps.forEach((map) => {
            Object.assign(map, map._settings, map._params);
            // 动态属性
            map.data = JSON.parse(JSON.stringify(map._params.data));
            map.y_length = map.data.length;
            map.x_length = map.data[0].length;
            map.imageData = null;
        });
    }

    // 重置
    reset() {
        Object.assign(this, this._settings, this._params);
        this.resetItems();
        this.resetMaps();
    }

    // 绑定事件
    bind(eventType, callback) {
        if (!Game._events[eventType]) {
            Game._events[eventType] = {};
            window.addEventListener(eventType, (e) => {
                var key = 's' + Game._index;
                if (Game._events[eventType][key]) {
                    Game._events[eventType][key](e);
                }
                e.preventDefault();
            });
        }
        // 绑定事件作用域，修正为传递回调函数本身
        Game._events[eventType]['s' + this.index] = callback.bind(this);
    }
    

}

// 通过ES6的class语法创建游戏类
class Game {
    // 其他类中需要使用，作为静态变量
    static _events = {};    // 事件集合
    static _canvas = null;  // 画布
    static _stages = [];    // 画布对象队列
    static _index = 0;      // 当前布景索引

    constructor(id, params = {}) {
        // 初始化设置对象
        const defaults = {
            width: 960,				// 画布宽度
            height: 640				// 画布高度
        };
        Object.assign(this, defaults, params);
        Game._canvas = document.getElementById(id);
        Game._canvas.width = this.width;
        Game._canvas.height = this.height;
        this._context = Game._canvas.getContext('2d');
        this._hander = null;
    }

    // 获取事件坐标
    static getPosition(e) {
        // 获取游戏画布的位置和大小
        var box = Game._canvas.getBoundingClientRect();

        // 返回鼠标相对于游戏画布内部的位置
        return {
            // 计算鼠标相对于画布左侧的x坐标
            x: e.clientX - box.left * (960 / box.width),
            // 计算鼠标相对于画布顶部的y坐标
            y: e.clientY - box.top * (640 / box.height)
        };
    }

    // 添加布景
    createStage(options) {
        var stage = new Stage(options);
        stage.index = Game._stages.length;
        Game._stages.push(stage);
        return stage;
    }

    // 指定布景
    setStage(index) {
        Game._stages[Game._index].status = 0;
        Game._index = index;
        Game._stages[Game._index].status = 1;
        Game._stages[Game._index].reset();      // 重置
        return Game._stages[Game._index];
    }

    // 下个布景
    nextStage() {
        if (Game._index < Game._stages.length - 1) {
            return this.setStage(++Game._index);
        } else {
            throw new Error('unfound new stage.');
        }
    };

    // 获取布景列表
    getStages() {
        return Game._stages;
    }

    // 初始化游戏引擎
    init() {
        Game._index = 0;
        this.start();
    }

    // 动画开始
    start() {
        var f = 0;      // 帧数计算
        var timestamp = (new Date().getTime());
        var fn = () => {
            var now = (new Date()).getTime();
            if (now - timestamp < 16) {
                this._hander = requestAnimationFrame(fn);
                return false;
            }
            timestamp = now;
            var stage = Game._stages[Game._index];
            this._context.clearRect(0, 0, this.width, this.height);     // 清除画布
            this._context.fillStyle = '#000000';
            this._context.fillRect(0, 0, this.width, this.height);
            f++;
            if (stage.timeout) {
                stage.timeout--;
            }
            // update返回false，不进行绘制
            if (stage.update() !== false) {
                stage.maps.forEach((map) => {
                    if (!(f % map.frames)) {
                        map.times = f / map.frames;     // 计数器
                    }
                    if (map.cache) {
                        if (!map.imageData) {
                            this._context.save();
                            map.draw(this._context);
                            map.imageData = this._context.getImageData(0, 0, this.width, this.height);
                            this._context.restore(); 
                        } else {
                            this._context.putImageData(map.imageData, 0, 0);
                        }
                    } else {
                        map.update();
                        map.draw(this._context);
                    }
                });

                stage.items.forEach((item) => {
                    if (!(f % item.frames)) {
                        item.times = f / item.frames;
                    }
                    // 对象及布景都不处于暂停状态
                    if (stage.status === 1 && item.status !== 2) {
                        if (item.location) {
                            item.coord = item.location.position2coord(item.x, item.y);
                        }
                        if (item.timeout) {
                            item.timeout--;
                        }
                        item.update();
                    }
                    item.draw(this._context);
                });

            }
            this._hander = requestAnimationFrame(fn);
        };
        this._hander = requestAnimationFrame(fn);
    }

    // 动画结束
    stop() {
        this._hander && cancelAnimationFrame(this._hander);
    }

}