// ================================================================
// PartPilot api.js — API client for the plain-HTML frontend
// ================================================================
//
// To point at a different API server, set before this script loads:
//   localStorage.setItem('pp_api_base', 'https://your-api.example.com')
//
// To set your Supabase auth token once auth is wired up:
//   localStorage.setItem('pp_token', supabaseSession.access_token)
//
// ================================================================

const API_BASE = localStorage.getItem('pp_api_base') || 'http://localhost:3000';

// ─── Auth ────────────────────────────────────────────────────────────────────
function getAuthToken() {
  return localStorage.getItem('pp_token');
}

// ─── Theme (runs on every page that loads api.js) ────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('pp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('pp_theme', next);
    });
  });
})();

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function _buildError(data, status) {
  // Handles both { error: { code, message } } and { error: "CODE", message: "..." }
  const isObj = data.error && typeof data.error === 'object';
  const code    = isObj ? data.error.code    : (data.error || 'UNKNOWN');
  const message = isObj ? data.error.message : (data.message || ('Request failed (' + status + ')'));
  const err     = new Error(message);
  err.code      = code;
  err.status    = status;
  // Attach extras like availableColumns for BOM column detection
  Object.assign(err, data);
  return err;
}

async function _apiPost(path, body) {
  const token = getAuthToken();
  const res = await fetch(API_BASE + path, {
    method:  'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { 'Authorization': 'Bearer ' + token } : {}
    ),
    body: JSON.stringify(body)
  });

  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw _buildError(data, res.status);
  return data;
}

async function _apiPostMultipart(path, formData) {
  const token = getAuthToken();
  const res = await fetch(API_BASE + path, {
    method:  'POST',
    // Do NOT set Content-Type — browser sets it with the correct boundary
    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    body:    formData
  });

  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw _buildError(data, res.status);
  return data;
}

// ─── DOM shorthand ────────────────────────────────────────────────────────────
function _el(id) { return document.getElementById(id); }

// ─── Render helpers ───────────────────────────────────────────────────────────
function _lifecycleBadge(status) {
  const MAP = {
    active:          ['badge-active',  'Active'],
    not_recommended: ['badge-nrnd',    'NRND'],
    obsolete:        ['badge-eol',     'Obsolete'],
    unknown:         ['badge-unknown', 'Unknown']
  };
  const pair = MAP[status] || MAP.unknown;
  return '<span class="badge ' + pair[0] + '">' + pair[1] + '</span>';
}

function _lifecycleTag(status) {
  const MAP = {
    active:          ['st-active', 'Active'],
    not_recommended: ['st-nrnd',   'NRND'],
    obsolete:        ['st-eol',    'Obsolete'],
    unknown:         ['',          '–']
  };
  const pair = MAP[status] || ['', '–'];
  return '<span class="st ' + pair[0] + '">' + pair[1] + '</span>';
}

// score ≥70 → green ("high"), 40-69 → amber ("med"), <40 → red ("low")
function _scoreClass(score) {
  return score >= 70 ? 'high' : score >= 40 ? 'med' : 'low';
}

function _fmtPrice(usd) {
  if (!usd || usd <= 0) return '–';
  return '$' + (+usd).toFixed(4).replace(/\.?0+$/, '');
}

function _fmtNum(n) {
  if (n == null) return '–';
  return Number(n).toLocaleString();
}

// ─── sessionStorage BOM cache ─────────────────────────────────────────────────
function _storeBom(reportId, data) {
  try { sessionStorage.setItem('pp_bom_' + reportId, JSON.stringify(data)); } catch (_) {}
}

function _readBom(reportId) {
  try {
    const raw = sessionStorage.getItem('pp_bom_' + reportId);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ================================================================
//  PART DETAIL  (called from part-detail.html)
// ================================================================
async function loadPartDetail(pn) {
  // Reset all slots to blank state
  _el('partNumber').textContent   = pn;
  _el('partDesc').textContent     = '';
  _el('statusBadge').innerHTML    = _lifecycleBadge('unknown');
  _el('pkgInfo').textContent      = '';
  _el('ssScore').textContent      = '–';
  _el('ssBar').style.width        = '0%';
  _el('ssDetail').textContent     = '';
  _el('ssVerdict').textContent    = '';
  _el('distList').innerHTML       = '';
  _el('bestPrice').textContent    = '–';
  _el('totalStock').textContent   = '–';
  _el('specsGrid').innerHTML      = '';
  _el('issuesList').innerHTML     = '';
  _el('altsList').innerHTML       = '';
  _el('alertBanner').style.display = 'none';

  try {
    // Fire part search and alternates in parallel; alternates failing is non-fatal
    const [searchRes, altsRes] = await Promise.all([
      _apiPost('/api/part/search', { part_number: pn }),
      _apiPost('/api/part/alternates', { part_number: pn }).catch(function () { return { alternates: [] }; })
    ]);

    const part = (searchRes.results || [])[0];
    if (!part) {
      _el('alertBanner').style.display = 'flex';
      _el('alertText').textContent = 'No results found for "' + pn + '". Check the part number and try again.';
      return;
    }

    // ── Header ──────────────────────────────────────────────────
    _el('partNumber').textContent = part.partNumber;
    _el('partDesc').textContent   = part.description || '';
    _el('statusBadge').innerHTML  = _lifecycleBadge(part.lifecycleStatus);
    _el('pkgInfo').textContent    = (part.jlcpcb && part.jlcpcb.package) ? part.jlcpcb.package : '';

    // ── Second Source Score ──────────────────────────────────────
    var score = part.secondSourceScore || 0;
    var sc    = _scoreClass(score);
    _el('ssScore').textContent  = score;
    _el('ssScore').className    = 'ss-num ' + sc;
    _el('ssBar').style.width    = score + '%';
    _el('ssBar').className      = 'ss-bar ' + sc;
    _el('ssDetail').textContent = 'Risk: ' + part.riskLevel + ' · Match: ' + part.matchFlag;

    var VERDICT = {
      high: ['safe',    '✓ Well-sourced. Multiple distributors with stock and confirmed alternates.'],
      med:  ['caution', '⚠ Moderate risk. Limited stock or few confirmed alternates.'],
      low:  ['danger',  '✕ High risk. Single source, low stock, or no confirmed alternates.']
    };
    _el('ssVerdict').className   = 'ss-verdict ' + VERDICT[sc][0];
    _el('ssVerdict').textContent = VERDICT[sc][1];

    // ── Availability ────────────────────────────────────────────
    var distHtml   = '';
    var totalStock = 0;
    var bestPrice  = null;

    (part.offers || []).forEach(function (offer) {
      totalStock += (offer.stock || 0);
      if (offer.unitPriceUsd > 0 && (bestPrice === null || offer.unitPriceUsd < bestPrice)) {
        bestPrice = offer.unitPriceUsd;
      }
      var nameHtml = offer.url
        ? '<a href="' + offer.url + '" target="_blank" rel="noopener" class="dist-name" style="color:var(--blue);text-decoration:none">' + offer.distributor + ' ↗</a>'
        : '<div class="dist-name">' + offer.distributor + '</div>';

      distHtml +=
        '<div class="card dist">' +
          nameHtml +
          '<div class="dist-row">' +
            '<span class="dist-stock">' + _fmtNum(offer.stock) + ' in stock</span>' +
            '<span class="dist-price">' + _fmtPrice(offer.unitPriceUsd) + ' ea</span>' +
          '</div>' +
          '<div class="dist-lead">MOQ ' + (offer.minimumOrderQuantity || '–') + ' · ' + (offer.leadTimeDays || '–') + 'd lead</div>' +
        '</div>';
    });

    _el('distList').innerHTML   = distHtml || '<div class="card dist" style="color:var(--text-3);font-size:14px;padding:14px 16px">No distributor data available.</div>';
    _el('totalStock').textContent = _fmtNum(totalStock);
    _el('bestPrice').textContent  = bestPrice !== null ? _fmtPrice(bestPrice) : '–';

    // ── Key Specs (JLCPCB) ───────────────────────────────────────
    var j = part.jlcpcb;
    if (j) {
      var specs = [
        ['LCSC',          j.lcsc],
        ['Manufacturer',  j.manufacturer || part.manufacturer],
        ['Package',       j.package],
        ['Type',          j.type],
        ['JLCPCB Stock',  _fmtNum(j.stock)],
        ['JLCPCB Price',  _fmtPrice(j.price)]
      ].filter(function (s) { return !!s[1]; });

      _el('specsGrid').innerHTML = specs.length
        ? specs.map(function (s) {
            return '<div class="spec-cell"><div class="l">' + s[0] + '</div><div class="v">' + s[1] + '</div></div>';
          }).join('')
        : '<p style="color:var(--text-3);font-size:14px">No specification data available.</p>';
    } else {
      _el('specsGrid').innerHTML = '<p style="color:var(--text-3);font-size:14px">No specification data available.</p>';
    }

    // ── Community Issues ─────────────────────────────────────────
    var issues = searchRes.community_issues || [];
    var SEV = { critical: 'high', high: 'high', medium: 'med', low: 'low' };

    _el('issuesList').innerHTML = issues.length
      ? issues.map(function (iss) {
          var sc2 = SEV[iss.severity] || 'low';
          return '<div class="card issue">' +
            '<div class="issue-hdr">' +
              '<span class="sev-dot ' + sc2 + '"></span>' +
              '<span class="issue-title">' + iss.issue_type + '</span>' +
              '<span class="sev-tag ' + sc2 + '">' + iss.severity + '</span>' +
            '</div>' +
            '<div class="issue-desc">' + iss.description + '</div>' +
            (iss.submitted_by ? '<div class="issue-src">Reported by ' + iss.submitted_by + '</div>' : '') +
          '</div>';
        }).join('')
      : '<p style="color:var(--text-3);font-size:14px">No known community issues for this part.</p>';

    // ── Alternates ───────────────────────────────────────────────
    // Engine may return PartResult[] (secondSourceScore) or Alternate[] (confidence_score)
    var alts = altsRes.alternates || [];

    _el('altsList').innerHTML = alts.length
      ? alts.map(function (alt) {
          var altPn    = alt.partNumber  || alt.part_number  || '–';
          var altMfr   = alt.manufacturer || '';
          var altScore = alt.secondSourceScore != null ? alt.secondSourceScore : (alt.confidence_score || 0);
          var altRc    = _scoreClass(altScore);
          var isJlcpcb = (alt.jlcpcb != null) || (alt.jlcpcb_available === true);
          var summary  = alt.plain_english_summary || '';

          var jlcBadge = isJlcpcb
            ? '<span class="safe-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>JLCPCB</span>'
            : '';

          return '<div class="card alt">' +
            '<div class="alt-top">' +
              '<div>' +
                '<div class="alt-pn">' + altPn + '</div>' +
                '<div class="alt-mfr">' + altMfr + '</div>' +
              '</div>' +
              jlcBadge +
            '</div>' +
            '<div class="alt-conf">' +
              '<span class="cl">Confidence</span>' +
              '<span class="cv ' + altRc + '">' + altScore + '</span>' +
            '</div>' +
            (summary ? '<div class="issue-desc mt-sm">' + summary + '</div>' : '') +
          '</div>';
        }).join('')
      : '<p style="color:var(--text-3);font-size:14px">No alternates found for this part.</p>';

  } catch (err) {
    _el('alertBanner').style.display = 'flex';
    _el('alertText').textContent = err.message || 'Failed to load part data. Please try again.';
    console.error('[PartPilot] loadPartDetail:', err);
  }
}

// ================================================================
//  BOM UPLOAD  (called from bom-upload.html)
// ================================================================
async function uploadBOM(file, jlcpcbOnly, packages) {
  // jlcpcbOnly and packages are UI filters stored for future use;
  // the API currently processes all parts and the frontend can filter the results.
  var fd = new FormData();
  fd.append('file', file);

  var result;
  try {
    result = await _apiPostMultipart('/api/bom/upload', fd);
  } catch (err) {
    // If column auto-detection failed, retry with the first available column
    if (err.code === 'BOM_COLUMN_NOT_DETECTED' && Array.isArray(err.availableColumns) && err.availableColumns.length) {
      var fd2 = new FormData();
      fd2.append('file', file);
      fd2.append('column_name', err.availableColumns[0]);
      result = await _apiPostMultipart('/api/bom/upload-with-column', fd2);
    } else {
      throw err;
    }
  }

  _storeBom(result.requestId, result);
  return result.requestId;
}

async function loadDemoBOM() {
  var csv = [
    'Part Number,Quantity',
    'TDA2050A,10',
    'LM358,50',
    'NE555,25',
    'AMS1117-3.3,100',
    'STM32F103C8T6,5',
    'ATMEGA328P-AU,20'
  ].join('\n');

  var file = new File([csv], 'demo-bom.csv', { type: 'text/csv' });
  return uploadBOM(file, false, []);
}

// ================================================================
//  BOM REPORT  (called from bom-report.html)
// ================================================================
function loadBOMReport(reportId) {
  var data = _readBom(reportId);

  if (!data) {
    var tbody = _el('bomBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-3)">Report not found. Please upload a BOM first.</td></tr>';
    return;
  }

  var eng      = data.engineResult || {};
  var results  = eng.results       || [];
  var total    = eng.total_parts   || results.length || data.totalParts || 0;
  var atRisk   = eng.parts_at_risk    || 0;
  var altsReady = eng.alternates_ready || 0;

  if (_el('totalParts')) _el('totalParts').textContent = total;
  if (_el('atRisk'))     _el('atRisk').textContent     = atRisk;
  if (_el('altsReady'))  _el('altsReady').textContent  = altsReady;

  var tbody = _el('bomBody');
  if (!tbody) return;

  if (!results.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-3)">No parts in this report.</td></tr>';
    return;
  }

  tbody.innerHTML = results.map(function (row) {
    if (row.error) {
      return '<tr>' +
        '<td class="pn">' + (row.part_number || '–') + '</td>' +
        '<td class="qty">–</td>' +
        '<td colspan="4" style="color:var(--red);font-size:13px">' + row.error + '</td>' +
      '</tr>';
    }

    var pn    = row.part_number || '–';
    var score = row.supply_risk_score || 0;
    var rc    = _scoreClass(score);
    var stock = (row.mouser_stock || 0) + (row.digikey_stock || 0);
    var hasAlts = (row.alternates_count || 0) > 0;

    return '<tr>' +
      '<td class="pn" onclick="window.location.href=\'part-detail.html?part=\'+encodeURIComponent(\'' + pn.replace(/'/g, "\\'") + '\')">' + pn + '</td>' +
      '<td class="qty">–</td>' +
      '<td>' + _lifecycleTag(row.lifecycle_status) + '</td>' +
      '<td class="stock">' + _fmtNum(stock) + '</td>' +
      '<td class="risk-bar-cell">' +
        '<div class="risk-wrap">' +
          '<span class="risk-num ' + rc + '">' + score + '</span>' +
          '<div class="risk-bar"><div class="risk-fill ' + rc + '" style="width:' + score + '%"></div></div>' +
        '</div>' +
      '</td>' +
      '<td>' + (hasAlts
        ? '<div class="alt-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div>'
        : '<div class="alt-none">–</div>'
      ) + '</td>' +
    '</tr>';
  }).join('');
}

async function downloadReport(reportId) {
  var data = _readBom(reportId);
  if (!data) {
    alert('Report data not found. Please re-upload your BOM.');
    return;
  }

  var eng     = data.engineResult || {};
  var results = eng.results       || [];

  // Map BomResultItem → BomReportRow (fields the API's /api/bom/report endpoint expects)
  var parts = results
    .filter(function (r) { return !r.error; })
    .map(function (r) {
      return {
        partNumber:      r.part_number    || '',
        quantity:        null,               // not echoed back by engine
        manufacturer:   '',
        description:    '',
        package:        '',
        lifecycle:       r.lifecycle_status || 'unknown',
        mouserStock:    r.mouser_stock      || 0,
        digikeyStock:   r.digikey_stock     || 0,
        jlcpcbStock:    r.jlcpcb_available  ? 1 : 0,
        jlcpcbPrice:    0,
        moq:            0,
        leadTimeDays:   0,
        supplyRiskScore: r.supply_risk_score || 0,
        riskLevel:       r.risk_level        || 'unknown',
        alternatesCount: r.alternates_count  || 0,
        datasheetUrl:   ''
      };
    });

  try {
    var token = getAuthToken();
    var res = await fetch(API_BASE + '/api/bom/report', {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { 'Authorization': 'Bearer ' + token } : {}
      ),
      body: JSON.stringify({
        data: {
          requestId:   reportId,
          generatedAt: new Date().toISOString(),
          parts:       parts
        }
      })
    });

    if (!res.ok) throw new Error('Report generation failed (' + res.status + ')');

    var blob = await res.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'partpilot-bom-report.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Download failed: ' + err.message);
    console.error('[PartPilot] downloadReport:', err);
  }
}
