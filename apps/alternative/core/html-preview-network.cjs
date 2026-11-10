const dns = require('node:dns/promises');
const https = require('node:https');
const net = require('node:net');
const LIMIT = 32 * 1024 * 1024;
function publicAddress(value) {
  const family = net.isIP(value);
  if (family === 4) {
    const p = value.split('.').map(Number), [a,b,c] = p;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2 || b === 88 && c === 99) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    // Fail closed on transition/mapped, local, multicast and reserved ranges.
    // Only normal global-unicast 2000::/3 addresses are considered.
    const s = value.toLowerCase(), first=Number.parseInt(s.split(':')[0],16), second=Number.parseInt(s.split(':')[1]||'0',16);
    if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff || s.includes('.') || first===0x2001&&(second<0x200||second===0xdb8) || first===0x2002 || first===0x3fff) return false;
    return true;
  }
  return false;
}
function publicUrl(value) {
  let u; try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443' || u.href.length > 16384) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host.endsWith('.') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(host) || !host.includes('.') && !net.isIP(host)) return null;
  if (net.isIP(host) && !publicAddress(host)) return null;
  return u;
}
async function fetchPublicHttps(request, { signal, lookup = dns.lookup, requestHttps = https.request, onBytes = () => true } = {}) {
  signal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
  const url = publicUrl(request.url);
  if (!url || !['GET', 'HEAD'].includes(request.method || 'GET')) throw new Error('This external resource is not permitted.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const answers = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('Preview resource lookup timed out or was cancelled.'));
    if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(()=>lookup(hostname,{all:true,verbatim:true})).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw new Error('Private or reserved network addresses are not permitted.');
  if (signal?.aborted) throw new Error('Preview closed.');
  const pinned = answers[0];
  const headers = { 'accept-encoding': 'identity', 'user-agent': 'ThreadShelf-HTML-Preview', 'accept': request.headers?.get?.('accept') || '*/*' };
  const origin = request.headers?.get?.('origin'); if (origin) headers.origin = origin;
  return new Promise((resolve, reject) => {
    const req = requestHttps(url, { method: request.method || 'GET', headers, agent: false, signal, rejectUnauthorized: true,
      lookup: (_host, options, callback) => options?.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family) }, res => {
      const chunks = []; let size = 0, failed=false;
      res.on('data', data => { size += data.length; if (size > LIMIT || onBytes(data.length) === false) { failed=true;const error=new Error('Preview resource is too large.');reject(error);req.destroy(error); } else chunks.push(data); });
      res.on('error', reject);
      res.on('end', () => {
        if(failed)return;
        try {
        const output = {};
        for (const name of ['content-type','content-encoding','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','cross-origin-resource-policy','content-security-policy','vary']) if (typeof res.headers[name] === 'string') output[name] = res.headers[name];
        if (res.headers.location) {
          let destination; try { destination = new URL(res.headers.location, url).href; } catch {}
          if (!publicUrl(destination)) { reject(new Error('Unsafe resource redirect.')); return; }
          output.location = destination;
        }
        output['cache-control'] = 'no-store';
        const status = res.statusCode || 502;
        if(!Number.isInteger(status)||status<200||status>599)throw new Error('Unsupported external response status.');
        resolve(new Response([204,205,304].includes(status) || request.method === 'HEAD' ? null : Buffer.concat(chunks), { status, headers: output }));
        } catch(error) {reject(error);}
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('Preview resource timed out.')));
    req.on('error', reject); req.end();
  });
}
function previewCsp(external) {
  const online = external ? ' https:' : '';
  return `default-src 'none'; sandbox allow-scripts; script-src 'unsafe-inline'${online}; style-src 'unsafe-inline'${online}; img-src data: blob:${online}; font-src data:${online}; media-src data: blob:${online}; connect-src${external ? ' https:' : " 'none'"}; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; manifest-src 'none'`;
}
module.exports = { publicAddress, publicUrl, fetchPublicHttps, previewCsp };
