const http = require('node:http');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const less = require('less');

async function start() {
    const script = await esbuild.build({
        entryPoints: ['tests/fixture.js'], bundle: true, format: 'esm', write: false,
        loader: { '.hbs': 'text' }
    });
    const source = await fs.readFile('src/styles/daggerheart-card-deck-hud.less', 'utf8');
    const style = await less.render(source);
    const html = await fs.readFile('tests/fixture.html', 'utf8');
    const font = await fs.readFile('assets/fonts/Roboto-Variable.ttf');
    const routes = new Map([
        ['/', ['text/html', html]],
        ['/fixture.js', ['text/javascript', script.outputFiles[0].text]],
        ['/module.css', ['text/css', style.css]],
        ['/modules/daggerheart-card-deck-hud/assets/fonts/Roboto-Variable.ttf', ['font/ttf', font]]
    ]);
    http.createServer((request, response) => {
        const route = routes.get(request.url);
        if (!route) { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'Content-Type': route[0] }).end(route[1]);
    }).listen(4173, '127.0.0.1');
}

start().catch(error => { console.error(error); process.exitCode = 1; });
