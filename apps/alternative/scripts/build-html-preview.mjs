// Rebuild the shared, DOM-free HTML eligibility checks for both native and UI use.
import { build } from '../../reader/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const common={absWorkingDir:root,nodePaths:[path.resolve(root,'../reader/node_modules')],entryPoints:['core/html-preview-validation-source.mjs'],bundle:true,legalComments:'inline',logLevel:'info'};
await build({...common,platform:'node',format:'cjs',target:'node24',outfile:'core/html-preview-validation.cjs'});
await build({...common,platform:'browser',format:'iife',globalName:'TSHTMLPreviewValidation',target:'chrome144',outfile:'renderer/html-preview-validation.js'});
