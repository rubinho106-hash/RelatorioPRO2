const roundUnit = {
  "0": 0,
  "0.0": 1,
  "0.00": 2,
  "0.000": 3,
  "0.0000": 4,
  "0.00000": 5,
  "0.000000": 6
}

const lengthUnit = {
  "m": 1,
  "cm": 100,
  "mm": 1000
}

const areaUnit = {
  "m²": 1,
  "cm²": 10000,
  "mm²": 1000000
}
const volumeUnit = {
  "m³": 1,
  "cm³": 1000000,
  "mm³": 1000000000
}

// Round Number
function changeRound(id, callback, logMessage) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("change", function () {
    const roundValue = this.value;
    const selectedValue = roundUnit[roundValue];
    customLog(logMessage, roundValue);
    return callback(selectedValue);
  });

}

// Length Unit
function changeLength(id, callback, logMessage) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("change", function () {
    const formatLength = this.value;
    const selectedValue = lengthUnit[formatLength];
    customLog(logMessage, formatLength);
    return callback(selectedValue);
  });
}

// Area Unit
function changeArea(id, callback, logMessage) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("change", function () {
    const formatArea = this.value;
    const selectedValue = areaUnit[formatArea];
    customLog(logMessage, formatArea);
    return callback(selectedValue);
  });
}

// Volume Unit
function changeVolume(id, callback, logMessage) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("change", function () {
    const formatVolume = this.value;
    const selectedValue = volumeUnit[formatVolume];
    customLog(logMessage, formatVolume);
    return callback(selectedValue);
  })

}

document.addEventListener("DOMContentLoaded", function () {
  const sketchupApi = (window.sketchup && typeof window.sketchup === 'object') ? window.sketchup : {};
  const noop = function () {};

  changeRound("roundLength", typeof sketchupApi.roundLength === 'function' ? sketchupApi.roundLength : noop, "(Settings Units) 1a. Round Length selected: ");
  changeRound("roundArea", typeof sketchupApi.roundArea === 'function' ? sketchupApi.roundArea : noop, "(Settings Units) 1b. Round Area selected: ");
  changeRound("roundVolume", typeof sketchupApi.roundVolume === 'function' ? sketchupApi.roundVolume : noop, "(Settings Units) 1c. Round Volume selected: ");
  
  changeLength("formatLength", typeof sketchupApi.formatLength === 'function' ? sketchupApi.formatLength : noop, "(Settings Units) 2a. Length Unit selected: ");
  changeArea("formatArea", typeof sketchupApi.formatArea === 'function' ? sketchupApi.formatArea : noop, "(Settings Units) 2b. Area Unit selected: ");
  changeVolume("formatVolume", typeof sketchupApi.formatVolume === 'function' ? sketchupApi.formatVolume : noop, "(Settings Units) 2c. Volume Unit selected: ");

  // Decimal Separator
  document.getElementById('decimalSeparator').addEventListener('change', function () {
    const decimalSeparator = this.value;
    if (typeof sketchupApi.decimalSeparator === 'function') {
      sketchupApi.decimalSeparator(decimalSeparator);
    }
    customLog('7a. (Settings) Decimal Separator selected and saved: ', decimalSeparator);
    const thousandSeparator = (decimalSeparator === ',') ? '.' : ',';
    customLog('7b. (Settings) Thousand Separator selected and saved: ', thousandSeparator);
    localStorage.setItem('thousandSeparator', thousandSeparator);
  });

  const concreteCoverField = document.getElementById('concreteCoverThickness');
  if (concreteCoverField) {
    concreteCoverField.addEventListener('change', function () {
      let raw = String(this.value == null ? '' : this.value).trim();
      if (!raw) { raw = '0'; }

      const cm = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
      const meters = (cm / 100).toFixed(4);
      const decSep = document.getElementById('decimalSeparator').value || '.';
      let pretty = (Math.round(cm * 100) / 100).toString();
      if (decSep === ',') { pretty = pretty.replace('.', ','); }
      this.value = pretty;

      if (window.sketchup && typeof sketchup.concreteCoverThickness === 'function') {
        sketchup.concreteCoverThickness(meters);
      }
      customLog('(Settings) Capa de concreto (cm) salva: ', cm);
    });
  }

  const slabModeField = document.getElementById('slabMode');
  if (slabModeField) {
    slabModeField.addEventListener('change', function () {
      const mode = (String(this.value || '').toLowerCase() === 'nervurada') ? 'nervurada' : 'convencional';
      if (window.sketchup && typeof sketchup.slabMode === 'function') {
        sketchup.slabMode(mode);
      }
      customLog('(Settings) Tipo de laje salvo: ', mode);
    });
  }

  const slabFactorField = document.getElementById('slabRibbedFactor');
  if (slabFactorField) {
    slabFactorField.addEventListener('change', function () {
      let raw = String(this.value == null ? '' : this.value).trim();
      if (!raw) { raw = '0'; }

      const cm = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
      const meters = (cm / 100).toFixed(4);
      const decSep = document.getElementById('decimalSeparator').value || '.';
      let pretty = (Math.round(cm * 100) / 100).toString();
      if (decSep === ',') { pretty = pretty.replace('.', ','); }
      this.value = pretty;

      if (window.sketchup && typeof sketchup.slabRibbedFactor === 'function') {
        sketchup.slabRibbedFactor(meters);
      }
      customLog('(Settings) Fator nervurado (cm) salvo: ', cm);
    });
  }

  const concreteDensityField = document.getElementById('concreteDensity');
  if (concreteDensityField) {
    concreteDensityField.addEventListener('change', function () {
      let raw = String(this.value == null ? '' : this.value).trim();
      if (!raw) { raw = '2500'; }
      const density = Math.max(1, Math.round(parseFloat(raw.replace(',', '.')) || 2500));
      this.value = String(density);

      if (window.sketchup && typeof sketchup.concreteDensity === 'function') {
        sketchup.concreteDensity(String(density));
      }
      customLog('(Settings) Densidade do concreto (kg/m3) salva: ', density);
    });
  }

  const concreteCostField = document.getElementById('concreteCostPerM3');
  if (concreteCostField) {
    concreteCostField.addEventListener('change', function () {
      let raw = String(this.value == null ? '' : this.value).trim();
      if (!raw) { raw = '0'; }
      const val = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
      const decSep = document.getElementById('decimalSeparator').value || '.';
      let pretty = (Math.round(val * 100) / 100).toString();
      if (decSep === ',') { pretty = pretty.replace('.', ','); }
      this.value = pretty;

      if (window.sketchup && typeof sketchup.concreteCostPerM3 === 'function') {
        sketchup.concreteCostPerM3(String(val));
      }
      customLog('(Settings) Custo concreto (R$/m3) salvo: ', val);
    });
  }

  const epsCostField = document.getElementById('epsCostPerM3');
  if (epsCostField) {
    epsCostField.addEventListener('change', function () {
      let raw = String(this.value == null ? '' : this.value).trim();
      if (!raw) { raw = '0'; }
      const val = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
      const decSep = document.getElementById('decimalSeparator').value || '.';
      let pretty = (Math.round(val * 100) / 100).toString();
      if (decSep === ',') { pretty = pretty.replace('.', ','); }
      this.value = pretty;

      if (window.sketchup && typeof sketchup.epsCostPerM3 === 'function') {
        sketchup.epsCostPerM3(String(val));
      }
      customLog('(Settings) Custo EPS (R$/m3) salvo: ', val);
    });
  }

});

// Listen to user selecting to Update Extra Row
document.getElementById('formatLength').addEventListener('change', function () {
  updateExtraRow(this.value);
});

document.getElementById('formatArea').addEventListener('change', function () {
  updateExtraRow(this.value);
});

document.getElementById('formatVolume').addEventListener('change', function () {
  updateExtraRow(this.value);
});

document.getElementById('currency').addEventListener('change', function () {
  currency = this.value;
  customLog('8a. (Settings) Currency selected and saved: ', currency);
  localStorage.setItem('currency', currency);
  updateExtraRow(currency);
});