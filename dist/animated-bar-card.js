/**
 * Animated Bar Card for Home Assistant
 * https://github.com/smalarz/animated-bar-card
 *
 * @version 1.0.0
 * @license MIT
 */

const VERSION = '1.0.0';

// ─── LOCALES ───

const LOCALES = {
  en: {
    editor: {
      entity: 'Entity', name: 'Name', min: 'Min value', max: 'Max value',
      unit: 'Unit', decimals: 'Decimals', direction: 'Direction',
      direction_horizontal: 'Horizontal', direction_vertical: 'Vertical',
      bar_height: 'Bar height (px)', bar_spacing: 'Bar spacing (px)',
      show_value: 'Show value', show_name: 'Show name', show_icon: 'Show icon',
      show_header: 'Show header', severity: 'Severity thresholds',
      add_entity: '+ Add entity', color: 'Color', label: 'Label',
      animation_duration: 'Animation duration (ms)', columns: 'Columns (vertical)',
    },
    no_data: 'N/A',
  },
  pl: {
    editor: {
      entity: 'Encja', name: 'Nazwa', min: 'Wartość min', max: 'Wartość max',
      unit: 'Jednostka', decimals: 'Miejsca dziesiętne', direction: 'Kierunek',
      direction_horizontal: 'Poziomo', direction_vertical: 'Pionowo',
      bar_height: 'Wysokość paska (px)', bar_spacing: 'Odstęp (px)',
      show_value: 'Pokaż wartość', show_name: 'Pokaż nazwę', show_icon: 'Pokaż ikonę',
      show_header: 'Pokaż nagłówek', severity: 'Progi kolorów',
      add_entity: '+ Dodaj encję', color: 'Kolor', label: 'Etykieta',
      animation_duration: 'Czas animacji (ms)', columns: 'Kolumny (pionowo)',
    },
    no_data: 'Brak',
  },
  de: {
    editor: {
      entity: 'Entität', name: 'Name', min: 'Min-Wert', max: 'Max-Wert',
      unit: 'Einheit', decimals: 'Dezimalstellen', direction: 'Richtung',
      direction_horizontal: 'Horizontal', direction_vertical: 'Vertikal',
      bar_height: 'Balkenhöhe (px)', bar_spacing: 'Abstand (px)',
      show_value: 'Wert anzeigen', show_name: 'Name anzeigen', show_icon: 'Symbol anzeigen',
      show_header: 'Kopfzeile anzeigen', severity: 'Schwellenwerte',
      add_entity: '+ Entität hinzufügen', color: 'Farbe', label: 'Beschriftung',
      animation_duration: 'Animationsdauer (ms)', columns: 'Spalten (vertikal)',
    },
    no_data: 'N/A',
  },
};

function getLocale(hass) {
  if (!hass) return LOCALES.en;
  const lang = (hass.language || 'en').substring(0, 2);
  return LOCALES[lang] || LOCALES.en;
}

// ─── HELPERS ───

function formatVal(v, decimals) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(decimals ?? 0);
}

function parseSeverity(sev) {
  if (!sev) return null;
  if (Array.isArray(sev)) {
    return sev.map(s => ({ from: parseFloat(s.from), to: parseFloat(s.to), color: s.color }))
      .sort((a, b) => a.from - b.from);
  }
  return null;
}

function getSegmentColor(value, severity, defaultColor) {
  if (!severity) return defaultColor;
  for (const s of severity) {
    if (value >= s.from && value < s.to) return s.color;
  }
  // Check last segment with <= for max boundary
  const last = severity[severity.length - 1];
  if (last && value >= last.from && value <= last.to) return last.color;
  return defaultColor;
}

// ─── DEFAULT SEVERITY ───

const DEFAULT_SEVERITY = [
  { from: 0, to: 33, color: '#4caf50' },
  { from: 33, to: 66, color: '#ff9800' },
  { from: 66, to: 100, color: '#f44336' },
];

// ─── MAIN CARD ───

class AnimatedBarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._built = false;
    this._animatedValues = new Map();
    this._animFrames = new Map();
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    if (!this._built) this._buildShell();

    if (this._config.entities) {
      this._config.entities.forEach((entCfg, idx) => {
        const eid = entCfg.entity;
        if (!eid) return;
        const newVal = parseFloat(hass.states[eid]?.state);
        const oldVal = prev ? parseFloat(prev.states[eid]?.state) : NaN;
        if (!isNaN(newVal) && newVal !== oldVal) {
          const min = entCfg.min ?? this._config.min;
          this._animateValue(idx, isNaN(oldVal) ? min : oldVal, newVal);
        } else if (!this._animFrames.has(idx)) {
          this._render();
        }
      });
    }
  }

  setConfig(config) {
    if (!config.entities || !config.entities.length) {
      throw new Error('Please define at least one entity');
    }

    const entities = config.entities.map((e) => {
      if (typeof e === 'string') return { entity: e };
      return {
        entity: e.entity,
        name: e.name || e.label || '',
        color: e.color || '',
        min: e.min,
        max: e.max,
        decimals: e.decimals,
        unit: e.unit || '',
        icon: e.icon || '',
      };
    });

    this._config = {
      entities,
      name: config.name || '',
      min: config.min ?? 0,
      max: config.max ?? 100,
      show_value: config.show_value !== false,
      show_name: config.show_name !== false,
      show_icon: config.show_icon !== false,
      show_header: config.show_header !== false,
      direction: config.direction || 'horizontal',
      bar_height: config.bar_height ?? 20,
      bar_spacing: config.bar_spacing ?? 12,
      decimals: config.decimals ?? 0,
      unit: config.unit || '',
      severity: parseSeverity(config.severity) || DEFAULT_SEVERITY,
      animation_duration: config.animation_duration ?? 800,
      columns: config.columns || 'auto',
    };
    this._built = false;
    this._animatedValues.clear();
  }

  disconnectedCallback() {
    this._animFrames.forEach(frame => cancelAnimationFrame(frame));
    this._animFrames.clear();
  }

  _animateValue(idx, from, to) {
    if (this._animFrames.has(idx)) {
      cancelAnimationFrame(this._animFrames.get(idx));
    }
    const duration = this._config.animation_duration;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      this._animatedValues.set(idx, from + (to - from) * eased);
      this._render();
      if (progress < 1) {
        this._animFrames.set(idx, requestAnimationFrame(tick));
      } else {
        this._animFrames.delete(idx);
        this._animatedValues.set(idx, to);
      }
    };
    this._animFrames.set(idx, requestAnimationFrame(tick));
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `<style>${this._css()}</style>
      <ha-card>
        <div class="bar-card" id="card"></div>
      </ha-card>`;
    this._built = true;
  }

  _render() {
    if (!this._built || !this._hass) return;
    const cfg = this._config;
    const states = this._hass.states;
    const l = getLocale(this._hass);
    const isVertical = cfg.direction === 'vertical';

    let html = '';

    // Header
    if (cfg.show_header && cfg.name) {
      html += `<div class="card-header">${cfg.name}</div>`;
    }

    // Bars container
    const containerClass = isVertical ? 'bars-container vertical' : 'bars-container horizontal';
    const columnStyle = isVertical && cfg.columns !== 'auto' ? ` style="grid-template-columns: repeat(${cfg.columns}, 1fr);"` : '';
    html += `<div class="${containerClass}"${columnStyle}>`;

    cfg.entities.forEach((entCfg, idx) => {
      const eid = entCfg.entity;
      const state = states[eid];
      const rawVal = state ? parseFloat(state.state) : NaN;
      const currentVal = this._animatedValues.get(idx);
      const val = currentVal !== undefined && !isNaN(currentVal) ? currentVal : rawVal;
      const available = state && state.state !== 'unavailable' && state.state !== 'unknown' && !isNaN(rawVal);

      const min = entCfg.min ?? cfg.min;
      const max = entCfg.max ?? cfg.max;
      const decimals = entCfg.decimals ?? cfg.decimals;
      const unit = entCfg.unit || cfg.unit || state?.attributes.unit_of_measurement || '';
      const name = entCfg.name || state?.attributes.friendly_name || eid;
      const icon = entCfg.icon || state?.attributes.icon || '';

      // Calculate percentage
      const clampedVal = Math.max(min, Math.min(max, val));
      const pct = available && !isNaN(val) ? ((clampedVal - min) / (max - min)) * 100 : 0;

      // Get color
      let color = entCfg.color || '';
      if (!color && available) {
        color = getSegmentColor(clampedVal, cfg.severity, '#3b82f6');
      } else if (!color) {
        color = 'var(--secondary-text-color)';
      }

      // Format display value
      const displayVal = available ? formatVal(rawVal, decimals) : l.no_data;

      html += `<div class="bar-item ${isVertical ? 'vertical' : 'horizontal'}">`;

      if (isVertical) {
        // Vertical layout: value on top, bar in middle, label at bottom
        if (cfg.show_value) {
          html += `<div class="bar-value" style="color:${color}">${displayVal}<span class="bar-unit">${unit}</span></div>`;
        }
        html += `<div class="bar-track" style="height: 120px;">`;
        if (available && pct > 0) {
          const gradientId = `bar-grad-${idx}`;
          html += `<svg style="position: absolute; width: 0; height: 0;"><defs>
            <linearGradient id="${gradientId}" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
            </linearGradient>
          </defs></svg>`;
          html += `<div class="bar-fill vertical" style="height: ${pct}%; background: url(#${gradientId}); background: linear-gradient(to top, ${color}80, ${color});">
            <div class="bar-glow" style="background: ${color};"></div>
          </div>`;
        }
        html += `</div>`;
        if (cfg.show_name || cfg.show_icon) {
          html += `<div class="bar-label">`;
          if (cfg.show_icon && icon) {
            html += `<ha-icon icon="${icon}" style="width: 16px; height: 16px; margin-right: 4px;"></ha-icon>`;
          }
          if (cfg.show_name) {
            html += `<span>${name}</span>`;
          }
          html += `</div>`;
        }
      } else {
        // Horizontal layout: icon + label on left, bar in middle, value on right
        if (cfg.show_name || cfg.show_icon) {
          html += `<div class="bar-label">`;
          if (cfg.show_icon && icon) {
            html += `<ha-icon icon="${icon}" style="width: 16px; height: 16px; margin-right: 4px;"></ha-icon>`;
          }
          if (cfg.show_name) {
            html += `<span>${name}</span>`;
          }
          html += `</div>`;
        }
        html += `<div class="bar-track" style="height: ${cfg.bar_height}px;">`;
        if (available && pct > 0) {
          const gradientId = `bar-grad-${idx}`;
          html += `<svg style="position: absolute; width: 0; height: 0;"><defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
            </linearGradient>
          </defs></svg>`;
          html += `<div class="bar-fill horizontal" style="width: ${pct}%; background: linear-gradient(to right, ${color}80, ${color});">
            <div class="bar-glow" style="background: ${color};"></div>
          </div>`;
        }
        html += `</div>`;
        if (cfg.show_value) {
          html += `<div class="bar-value" style="color:${color}">${displayVal}<span class="bar-unit">${unit}</span></div>`;
        }
      }

      html += `</div>`;
    });

    html += `</div>`;

    const card = this.shadowRoot.getElementById('card');
    card.innerHTML = html;
  }

  // ─── HA ───

  getCardSize() {
    const numEntities = this._config.entities?.length || 1;
    return Math.ceil(numEntities / 3) + 1;
  }

  static getConfigElement() {
    return document.createElement('animated-bar-card-editor');
  }

  static getStubConfig(hass) {
    const sensors = Object.keys(hass.states).filter(e => e.startsWith('sensor.')).slice(0, 3);
    return {
      entities: sensors.map(e => ({ entity: e })),
      name: 'Bar Chart',
      min: 0,
      max: 100,
    };
  }

  _css() {
    return `
      :host { display: block; }
      ha-card { overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); }
      .bar-card { padding: 16px; }
      .card-header {
        font-size: 16px; font-weight: 600; margin-bottom: 12px;
        color: var(--primary-text-color);
      }
      .bars-container.horizontal { display: flex; flex-direction: column; gap: ${this._config.bar_spacing ?? 12}px; }
      .bars-container.vertical {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        gap: ${this._config.bar_spacing ?? 12}px;
      }
      .bar-item.horizontal {
        display: grid;
        grid-template-columns: ${this._config.show_name || this._config.show_icon ? 'minmax(100px, 0.3fr)' : ''} 1fr ${this._config.show_value ? 'auto' : ''};
        gap: 12px;
        align-items: center;
      }
      .bar-item.vertical {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .bar-label {
        display: flex;
        align-items: center;
        font-size: 13px;
        color: var(--secondary-text-color);
        font-weight: 500;
      }
      .bar-track {
        position: relative;
        background: rgba(148, 163, 184, 0.12);
        border-radius: 6px;
        overflow: hidden;
        flex: 1;
        width: 100%;
      }
      .bar-item.vertical .bar-track {
        width: ${this._config.bar_height ?? 20}px;
      }
      .bar-fill {
        position: absolute;
        border-radius: 6px;
        transition: color 0.5s ease;
      }
      .bar-fill.horizontal {
        height: 100%;
        left: 0;
        top: 0;
      }
      .bar-fill.vertical {
        width: 100%;
        bottom: 0;
        left: 0;
      }
      .bar-glow {
        position: absolute;
        opacity: 0.12;
        border-radius: 50%;
      }
      .bar-fill.horizontal .bar-glow {
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        width: ${(this._config.bar_height ?? 20) * 0.6}px;
        height: ${(this._config.bar_height ?? 20) * 0.6}px;
      }
      .bar-fill.vertical .bar-glow {
        top: -4px;
        left: 50%;
        transform: translateX(-50%);
        width: ${(this._config.bar_height ?? 20) * 0.6}px;
        height: ${(this._config.bar_height ?? 20) * 0.6}px;
      }
      .bar-value {
        font-size: 16px;
        font-weight: 300;
        letter-spacing: -0.5px;
        white-space: nowrap;
        transition: color 0.5s ease;
      }
      .bar-item.vertical .bar-value {
        text-align: center;
      }
      .bar-unit {
        font-size: 12px;
        opacity: 0.7;
        margin-left: 2px;
        font-weight: 400;
      }
    `;
  }
}

// ─── EDITOR ───

class AnimatedBarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config));
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) this._render();
  }

  _fireChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: JSON.parse(JSON.stringify(this._config)) }
    }));
  }

  _getSensorEntities() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states).filter(e => e.startsWith('sensor.')).sort()
      .map(id => ({ id, name: this._hass.states[id].attributes.friendly_name || id }));
  }

  _setupAutocomplete(input, onSelect) {
    const entities = this._getSensorEntities();
    const wrap = input.parentElement;
    wrap.style.position = 'relative';
    const dropdown = document.createElement('div');
    dropdown.className = 'ac-list';
    wrap.appendChild(dropdown);
    let selectedIdx = -1;

    const show = (items) => {
      dropdown.innerHTML = items.map((e, i) =>
        `<div class="ac-item${i === selectedIdx ? ' ac-active' : ''}" data-val="${e.id}">${e.name} <span class="ac-id">${e.id}</span></div>`
      ).join('');
      dropdown.style.display = items.length ? 'block' : 'none';
    };
    const hide = () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); };
    const filter = (q) => {
      const lq = q.toLowerCase();
      return entities.filter(e => e.id.toLowerCase().includes(lq) || e.name.toLowerCase().includes(lq)).slice(0, 40);
    };

    input.addEventListener('focus', () => show(filter(input.value)));
    input.addEventListener('blur', hide);
    input.addEventListener('input', () => { selectedIdx = -1; show(filter(input.value)); });
    input.addEventListener('keydown', (ev) => {
      const items = dropdown.querySelectorAll('.ac-item');
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        show(filter(input.value));
        items[selectedIdx]?.scrollIntoView({block:'nearest'});
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        show(filter(input.value));
        items[selectedIdx]?.scrollIntoView({block:'nearest'});
      } else if (ev.key === 'Enter' && selectedIdx >= 0 && items[selectedIdx]) {
        ev.preventDefault();
        input.value = items[selectedIdx].dataset.val;
        dropdown.style.display = 'none';
        onSelect(input.value);
      } else if (ev.key === 'Escape') {
        dropdown.style.display = 'none';
      }
    });
    dropdown.addEventListener('mousedown', (ev) => {
      const item = ev.target.closest('.ac-item');
      if (item) {
        input.value = item.dataset.val;
        dropdown.style.display = 'none';
        onSelect(input.value);
      }
    });
    input.addEventListener('change', () => onSelect(input.value.trim()));
  }

  _render() {
    this._rendered = true;
    const c = this._config;
    const l = getLocale(this._hass);
    const e = l.editor;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .form { padding: 8px 0; }
        .row { margin-bottom: 12px; }
        .row label { display: block; font-size: 12px; margin-bottom: 4px; color: var(--secondary-text-color); font-weight: 500; }
        .row input, .row select { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #e0e0e0); background: var(--card-background-color, #fff); color: var(--primary-text-color); font-size: 13px; box-sizing: border-box; }
        .row input:focus, .row select:focus { border-color: var(--primary-color); outline: none; }
        .inline { display: flex; gap: 8px; }
        .inline > * { flex: 1; }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
        .toggle-row label { margin: 0; font-size: 12px; color: var(--secondary-text-color); }
        .section { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--secondary-text-color); margin: 16px 0 6px; font-weight: 600; }
        .ac-list { display: none; position: absolute; z-index: 999; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color); border-top: none; border-radius: 0 0 8px 8px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
        .ac-item { padding: 8px 10px; cursor: pointer; font-size: 13px; color: var(--primary-text-color); border-bottom: 1px solid var(--divider-color, #f0f0f0); }
        .ac-item:last-child { border-bottom: none; }
        .ac-item:hover, .ac-active { background: var(--primary-color, #03a9f4); color: #fff; }
        .ac-item:hover .ac-id, .ac-active .ac-id { color: rgba(255,255,255,.7); }
        .ac-id { font-size: 11px; color: var(--secondary-text-color); margin-left: 6px; }
        .entity-block { background: var(--secondary-background-color, #f5f5f5); border-radius: 8px; padding: 12px; margin-bottom: 10px; position: relative; }
        .entity-block .remove { position: absolute; top: 8px; right: 8px; cursor: pointer; color: var(--error-color, #ef4444); font-size: 18px; background: none; border: none; padding: 2px 6px; }
        .seg-block { background: var(--secondary-background-color, #f5f5f5); border-radius: 8px; padding: 10px; margin-bottom: 6px; position: relative; }
        .seg-block .remove { position: absolute; top: 6px; right: 6px; cursor: pointer; color: var(--error-color, #ef4444); font-size: 16px; background: none; border: none; padding: 2px 4px; }
        .add-btn { cursor: pointer; color: var(--primary-color); font-size: 13px; font-weight: 500; padding: 8px 0; }
      </style>
      <div class="form">
        <div class="row"><label>${e.name}</label><input id="name" value="${c.name || ''}"></div>
        <div class="inline">
          <div class="row"><label>${e.min}</label><input id="min" type="number" value="${c.min ?? 0}"></div>
          <div class="row"><label>${e.max}</label><input id="max" type="number" value="${c.max ?? 100}"></div>
        </div>
        <div class="inline">
          <div class="row"><label>${e.unit}</label><input id="unit" value="${c.unit || ''}"></div>
          <div class="row"><label>${e.decimals}</label><input id="decimals" type="number" min="0" max="5" value="${c.decimals ?? 0}"></div>
        </div>
        <div class="inline">
          <div class="row">
            <label>${e.direction}</label>
            <select id="direction">
              <option value="horizontal" ${c.direction === 'horizontal' || !c.direction ? 'selected' : ''}>${e.direction_horizontal}</option>
              <option value="vertical" ${c.direction === 'vertical' ? 'selected' : ''}>${e.direction_vertical}</option>
            </select>
          </div>
          <div class="row"><label>${e.bar_height}</label><input id="bar_height" type="number" min="10" max="50" value="${c.bar_height ?? 20}"></div>
        </div>
        <div class="inline">
          <div class="row"><label>${e.bar_spacing}</label><input id="bar_spacing" type="number" min="0" max="30" value="${c.bar_spacing ?? 12}"></div>
          <div class="row"><label>${e.animation_duration}</label><input id="animation_duration" type="number" min="0" max="3000" step="100" value="${c.animation_duration ?? 800}"></div>
        </div>
        <div class="toggle-row"><label>${e.show_value}</label><input type="checkbox" id="show_value" ${c.show_value !== false ? 'checked' : ''}></div>
        <div class="toggle-row"><label>${e.show_name}</label><input type="checkbox" id="show_name" ${c.show_name !== false ? 'checked' : ''}></div>
        <div class="toggle-row"><label>${e.show_icon}</label><input type="checkbox" id="show_icon" ${c.show_icon !== false ? 'checked' : ''}></div>
        <div class="toggle-row"><label>${e.show_header}</label><input type="checkbox" id="show_header" ${c.show_header !== false ? 'checked' : ''}></div>
        <div class="section">Entities</div>
        <div id="entities-list"></div>
        <div class="add-btn" id="add-entity">${e.add_entity}</div>
        <div class="section">${e.severity}</div>
        <div id="severity-list"></div>
        <div class="add-btn" id="add-seg">+ Add segment</div>
      </div>`;

    // Text inputs
    this.shadowRoot.getElementById('name')?.addEventListener('change', (ev) => {
      if (ev.target.value) this._config.name = ev.target.value;
      else delete this._config.name;
      this._fireChanged();
    });
    this.shadowRoot.getElementById('unit')?.addEventListener('change', (ev) => {
      if (ev.target.value) this._config.unit = ev.target.value;
      else delete this._config.unit;
      this._fireChanged();
    });

    // Number inputs
    ['min', 'max', 'decimals', 'bar_height', 'bar_spacing', 'animation_duration'].forEach(id => {
      this.shadowRoot.getElementById(id)?.addEventListener('change', (ev) => {
        this._config[id] = parseFloat(ev.target.value);
        this._fireChanged();
      });
    });

    // Direction select
    this.shadowRoot.getElementById('direction')?.addEventListener('change', (ev) => {
      this._config.direction = ev.target.value;
      this._fireChanged();
    });

    // Toggles
    ['show_value', 'show_name', 'show_icon', 'show_header'].forEach(id => {
      this.shadowRoot.getElementById(id)?.addEventListener('change', (ev) => {
        this._config[id] = ev.target.checked;
        this._fireChanged();
      });
    });

    // Entities
    this._renderEntities();
    this.shadowRoot.getElementById('add-entity')?.addEventListener('click', () => {
      if (!this._config.entities) this._config.entities = [];
      this._config.entities.push({ entity: '' });
      this._fireChanged();
      this._renderEntities();
    });

    // Severity segments
    this._renderSeverity();
    this.shadowRoot.getElementById('add-seg')?.addEventListener('click', () => {
      if (!this._config.severity) this._config.severity = [];
      const last = this._config.severity[this._config.severity.length - 1];
      this._config.severity.push({ from: last ? last.to : 0, to: this._config.max ?? 100, color: '#3b82f6' });
      this._fireChanged();
      this._renderSeverity();
    });
  }

  _renderEntities() {
    const list = this.shadowRoot.getElementById('entities-list');
    if (!list) return;
    const entities = this._config.entities || [];
    const l = getLocale(this._hass);
    const e = l.editor;

    list.innerHTML = entities.map((ent, i) => `
      <div class="entity-block">
        <button class="remove" data-idx="${i}">×</button>
        <div class="row"><label>${e.entity}</label><div class="ac-wrap"><input class="ent-field" data-idx="${i}" data-key="entity" value="${ent.entity || ''}" autocomplete="off"></div></div>
        <div class="row"><label>${e.label}</label><input class="ent-field" data-idx="${i}" data-key="name" value="${ent.name || ent.label || ''}"></div>
        <div class="row"><label>${e.color}</label><input class="ent-field" data-idx="${i}" data-key="color" type="color" value="${ent.color || '#3b82f6'}"></div>
        <div class="inline">
          <div class="row"><label>${e.min}</label><input class="ent-field" data-idx="${i}" data-key="min" type="number" value="${ent.min ?? ''}"></div>
          <div class="row"><label>${e.max}</label><input class="ent-field" data-idx="${i}" data-key="max" type="number" value="${ent.max ?? ''}"></div>
        </div>
      </div>`).join('');

    // Setup autocomplete for entity fields
    list.querySelectorAll('.ent-field[data-key="entity"]').forEach(input => {
      const idx = parseInt(input.dataset.idx);
      this._setupAutocomplete(input, (val) => {
        if (!this._config.entities) this._config.entities = [];
        this._config.entities[idx].entity = val;
        this._fireChanged();
      });
    });

    // Other entity fields
    list.querySelectorAll('.ent-field').forEach(el => {
      if (el.dataset.key === 'entity') return; // Already handled
      el.addEventListener('change', (ev) => {
        const idx = parseInt(ev.target.dataset.idx);
        const key = ev.target.dataset.key;
        if (!this._config.entities) this._config.entities = [];
        if (key === 'color' || key === 'name') {
          this._config.entities[idx][key] = ev.target.value;
        } else if (key === 'min' || key === 'max') {
          if (ev.target.value) {
            this._config.entities[idx][key] = parseFloat(ev.target.value);
          } else {
            delete this._config.entities[idx][key];
          }
        }
        this._fireChanged();
      });
    });

    // Remove buttons
    list.querySelectorAll('.remove').forEach(el => {
      el.addEventListener('click', (ev) => {
        if (!this._config.entities) this._config.entities = [];
        this._config.entities.splice(parseInt(ev.target.dataset.idx), 1);
        this._fireChanged();
        this._renderEntities();
      });
    });
  }

  _renderSeverity() {
    const list = this.shadowRoot.getElementById('severity-list');
    if (!list) return;
    const segs = this._config.severity || DEFAULT_SEVERITY;

    list.innerHTML = segs.map((s, i) => `
      <div class="seg-block">
        <button class="remove" data-idx="${i}">×</button>
        <div class="inline">
          <div class="row"><label>From</label><input class="seg-field" data-idx="${i}" data-key="from" type="number" value="${s.from}"></div>
          <div class="row"><label>To</label><input class="seg-field" data-idx="${i}" data-key="to" type="number" value="${s.to}"></div>
          <div class="row"><label>Color</label><input class="seg-field" data-idx="${i}" data-key="color" type="color" value="${s.color}"></div>
        </div>
      </div>`).join('');

    list.querySelectorAll('.seg-field').forEach(el => {
      el.addEventListener('change', (ev) => {
        const idx = parseInt(ev.target.dataset.idx);
        const key = ev.target.dataset.key;
        if (!this._config.severity) this._config.severity = [...DEFAULT_SEVERITY];
        if (key === 'color') {
          this._config.severity[idx][key] = ev.target.value;
        } else {
          this._config.severity[idx][key] = parseFloat(ev.target.value);
        }
        this._fireChanged();
      });
    });

    list.querySelectorAll('.remove').forEach(el => {
      el.addEventListener('click', (ev) => {
        if (!this._config.severity) this._config.severity = [...DEFAULT_SEVERITY];
        this._config.severity.splice(parseInt(ev.target.dataset.idx), 1);
        this._fireChanged();
        this._renderSeverity();
      });
    });
  }
}

// ─── REGISTER ───

customElements.define('animated-bar-card', AnimatedBarCard);
customElements.define('animated-bar-card-editor', AnimatedBarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'animated-bar-card',
  name: 'Animated Bar Card',
  description: 'Animated bar chart card with severity colors, smooth transitions, and interactive bars',
  preview: true,
  documentationURL: 'https://github.com/smalarz/animated-bar-card',
});

console.info('%c ANIMATED-BAR-CARD %c v' + VERSION + ' ', 'color:#fff;background:#10b981;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px', 'color:#10b981;background:#d1fae5;font-weight:700;padding:2px 6px;border-radius:0 4px 4px 0');
