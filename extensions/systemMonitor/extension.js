/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const GTop = imports.gi.GTop;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

function Indicator() {
    this._init();
}

Indicator.prototype = {
    _init: function() {
	this._initValues();
        this.actor = new St.DrawingArea({ style_class: "extension-systemMonitor-indicator-area",
                                          reactive: true});
        this.actor.connect('repaint', Lang.bind(this, this._draw));
        this.actor.connect('button-press-event', function() {
            let app = Shell.AppSystem.get_default().get_app("gnome-system-monitor.desktop");
            app.open_new_window(-1);
        });

	Mainloop.timeout_add(250, Lang.bind(this, function () {
	    this._updateValues();
            this.actor.queue_repaint();
            return true;
	}));
    },

    _initValues: function() {
    },

    _updateValues: function() {
    },

    _draw: function(area) {
        let [width, height] = area.get_surface_size();
        let themeNode = this.actor.get_theme_node();
        let cr = area.get_context();
        for (let i = this.values.length - 1; i >= 0; i--) {
            let color = themeNode.get_color(this.values[i].color);
            cr.moveTo(0, height);
            let k;
            for (k = 0; k < this.values[i].values.length; k++) {
                cr.lineTo(k, (1 - this.values[i].values[k]) * height);
            }
            if (k > width)
                this.values[i].values.shift();
            cr.lineTo(k, height);
            cr.lineTo(0, height);
            cr.closePath();
            Clutter.cairo_set_source_color(cr, color);

	    cr.fill();
        }
    }
};

function CpuIndicator() {
    this._init();
}

CpuIndicator.prototype = {
    __proto__: Indicator.prototype,

    _initValues: function() {
        this._prev = new GTop.glibtop_cpu;
        GTop.glibtop_get_cpu(this._prev);

	this.values = [];
	this.values.push({color: "-cpu-user-color", values: []});
	this.values.push({color: "-cpu-sys-color", values: []});
	this.values.push({color: "-cpu-iowait-color", values: []});
    },

    _updateValues: function() {
        let cpu = new GTop.glibtop_cpu;
        let t = 0.0;
        GTop.glibtop_get_cpu(cpu);
        let total = cpu.total - this._prev.total;
        let user = cpu.user - this._prev.user;
        let sys = cpu.sys - this._prev.sys;
        let iowait = cpu.iowait - this._prev.iowait;

        t = user / total;
        this.values[0].values.push(t);

        t += sys / total;
        this.values[1].values.push(t);
        t += iowait / total;
        this.values[2].values.push(t);

        this._prev = cpu;
    }
};

function MemoryIndicator() {
    this._init();
}

MemoryIndicator.prototype = {
    __proto__: Indicator.prototype,

    _initValues: function() {
        this.mem = new GTop.glibtop_mem;
	this.values = [];
        this.values.push({ color: "-mem-user-color", values: [] });
        this.values.push({ color: "-mem-other-color", values: [] });
        this.values.push({ color: "-mem-cached-color", values: [] });
    },

    _updateValues: function() {
        GTop.glibtop_get_mem(this.mem);

        let t = this.mem.user / this.mem.total;
        this.values[0].values.push(t);
        t += (this.mem.used - this.mem.user - this.mem.cached) / this.mem.total;
        this.values[1].values.push(t);
        t += this.mem.cached / this.mem.total;
        this.values[2].values.push(t);
    }
};

function main() {
    let box = new St.BoxLayout({ style_class: 'extension-systemMonitor-container' });
    box.add((new CpuIndicator()).actor);
    box.add((new MemoryIndicator()).actor);
    Main.messageTray.actor.add_actor(box);
}
