/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const GTop = imports.gi.GTop;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

const INDICATOR_UPDATE_INTERVAL = 500;
const INDICATOR_NUM_GRID_LINES = 3;

let _cpuIndicator;
let _memIndicator;
let _box;

const Indicator = new Lang.Class({
    Name: 'SystemMonitor.Indicator',

    _init: function() {
        this._initValues();
        this.drawing_area = new St.DrawingArea({ reactive: true });
        this.drawing_area.width = 100; this.drawing_area.height = 100;
        this.drawing_area.connect('repaint', Lang.bind(this, this._draw));
        this.drawing_area.connect('button-press-event', function() {
            let app = Shell.AppSystem.get_default().lookup_app('gnome-system-monitor.desktop');
            app.open_new_window(-1);
        });

        this.actor = new St.Bin({ style_class: "extension-systemMonitor-indicator-area",
                                  reactive: true});
        this.actor.add_actor(this.drawing_area);

        this._timeout = Mainloop.timeout_add(INDICATOR_UPDATE_INTERVAL, Lang.bind(this, function () {
            this._updateValues();
            this.drawing_area.queue_repaint();
            return true;
        }));
    },

    destroy: function() {
        Mainloop.source_remove(this._timeout);

        this.actor.destroy();
    },

    _initValues: function() {
    },

    _updateValues: function() {
    },

    _draw: function(area) {
        let [width, height] = area.get_surface_size();
        let themeNode = this.actor.get_theme_node();
        let cr = area.get_context();

        //draw the background grid
        let color = themeNode.get_color(this.gridColor);
        let gridOffset = Math.floor(height / (INDICATOR_NUM_GRID_LINES + 1));
        for (let i = 1; i <= INDICATOR_NUM_GRID_LINES; ++i) {
                cr.moveTo(0, i * gridOffset + .5);
                cr.lineTo(width, i * gridOffset + .5);
        }
        Clutter.cairo_set_source_color(cr, color);
        cr.setLineWidth(1);
        cr.setDash([4,1], 0);
        cr.stroke();
        
        //draw the foreground

        function makePath(values, reverse, nudge) {
            if (nudge == null) {
                nudge = 0;
            }
            //if we are going in reverse, we are completing the bottom of a chart, so use lineTo
            if (reverse) {
                cr.lineTo(values.length - 1, (1 - values[values.length - 1]) * height + nudge);
                for (let k = values.length - 2; k >= 0; --k) {
                    cr.lineTo(k, (1 - values[k]) * height + nudge);
                }
            } else {
                cr.moveTo(0, (1 - values[0]) * height + nudge);
                for (let k = 1; k < values.length; ++k) {
                    cr.lineTo(k, (1 - values[k]) * height + nudge);
                }

            }
        }
        
        let renderStats = this.renderStats;

        // Make sure we don't have more sample points than pixels
        renderStats.map(Lang.bind(this, function(k){
            let stat = this.stats[k];
            if (stat.values.length > width) {
                stat.values = stat.values.slice(stat.values.length - width, stat.values.length);
            }
        }));

        for (let i = 0; i < renderStats.length; ++i) {
            let stat = this.stats[renderStats[i]];
            // We outline at full opacity and fill with 40% opacity
            let outlineColor = themeNode.get_color(stat.color);
            let color = new Clutter.Color(outlineColor);
            color.alpha = color.alpha * .4;
           
            // Render the background between us and the next level
            makePath(stat.values, false);
            // If there is a process below us, render the cpu between us and it, otherwise, 
            // render to the bottom of the chart
            if (i == renderStats.length - 1) {
                cr.lineTo(stat.values.length - 1, height);
                cr.lineTo(0, height);
                cr.closePath();
            } else {
                let nextStat = this.stats[renderStats[i+1]];
                makePath(nextStat.values, true);
            }
            cr.closePath()
            Clutter.cairo_set_source_color(cr, color);
            cr.fill();
            
            // Render the outline of this level
            makePath(stat.values, false, .5);
            Clutter.cairo_set_source_color(cr, outlineColor);
            cr.setLineWidth(1.0);
            cr.setDash([], 0);
            cr.stroke();
        }
    }
});

const CpuIndicator = new Lang.Class({
    Name: 'SystemMonitor.CpuIndicator',
    Extends: Indicator,

    _init: function() {
        this.parent();

        this.gridColor = '-grid-color';
        this.renderStats = [ 'cpu-user', 'cpu-sys', 'cpu-iowait' ];
        
        // Make sure renderStats is sorted as necessary for rendering
        let renderStatOrder = {'cpu-total': 0, 'cpu-user': 1, 'cpu-sys': 2, 'cpu-iowait': 3};
        this.renderStats = this.renderStats.sort(function(a,b) {
            return renderStatOrder[a] - renderStatOrder[b];
        });
    },

    _initValues: function() {
        this._prev = new GTop.glibtop_cpu;
        GTop.glibtop_get_cpu(this._prev);

        this.stats = { 
                       'cpu-user': {color: '-cpu-user-color', values: []},
                       'cpu-sys': {color: '-cpu-sys-color', values: []},
                       'cpu-iowait': {color: '-cpu-iowait-color', values: []},
                       'cpu-total': {color: '-cpu-total-color', values: []} 
                     };
    },

    _updateValues: function() {
        let cpu = new GTop.glibtop_cpu;
        let t = 0.0;
        GTop.glibtop_get_cpu(cpu);
        let total = cpu.total - this._prev.total;
        let user = cpu.user - this._prev.user;
        let sys = cpu.sys - this._prev.sys;
        let iowait = cpu.iowait - this._prev.iowait;
        let idle = cpu.idle - this._prev.idle;

        t += iowait / total;
        this.stats['cpu-iowait'].values.push(t);
        t += sys / total;
        this.stats['cpu-sys'].values.push(t);
        t += user / total;
        this.stats['cpu-user'].values.push(t);
        this.stats['cpu-total'].values.push(1 - idle / total);
        
        this._prev = cpu;
    }
});

const MemoryIndicator = new Lang.Class({
    Name: 'SystemMonitor.MemoryIndicator',
    Extends: Indicator,
    
    _init: function() {
        this.parent();

        this.gridColor = '-grid-color';
        this.renderStats = [ 'mem-user', 'mem-other', 'mem-cached' ];
        
        // Make sure renderStats is sorted as necessary for rendering
        let renderStatOrder = { 'mem-cached': 0, 'mem-other': 1, 'mem-user': 2 };
        this.renderStats = this.renderStats.sort(function(a,b) {
            return renderStatOrder[a] - renderStatOrder[b];
        });
    },

    _initValues: function() {
        this.mem = new GTop.glibtop_mem;
        this.stats = {
                        'mem-user': { color: "-mem-user-color", values: [] },
                        'mem-other': { color: "-mem-other-color", values: [] },
                        'mem-cached': { color: "-mem-cached-color", values: [] }
                     };
    },

    _updateValues: function() {
        GTop.glibtop_get_mem(this.mem);

        let t = this.mem.user / this.mem.total;
        this.stats['mem-user'].values.push(t);
        t += (this.mem.used - this.mem.user - this.mem.cached) / this.mem.total;
        this.stats['mem-other'].values.push(t);
        t += this.mem.cached / this.mem.total;
        this.stats['mem-cached'].values.push(t);
    }
});

function init() {
    // nothing to do here
}

function enable() {
    _cpuIndicator = new CpuIndicator();
    _memIndicator = new MemoryIndicator();
    _box = new St.BoxLayout({ style_class: 'extension-systemMonitor-container' });
    _box.add(_cpuIndicator.actor);
    _box.add(_memIndicator.actor);
    Main.messageTray.actor.add_actor(_box);
}

function disable() {
    _cpuIndicator.destroy();
    _cpuIndicator = null;
    _memIndicator.destroy();
    _memIndicator = null;
    _box.destroy();
}
