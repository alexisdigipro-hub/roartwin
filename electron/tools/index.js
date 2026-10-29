// The tools of the app, one file each (Alex, 28 Oct: "a utility of many tools"). Each exports register(ctx), and
// ctx.handle('<tool>-<what>', fn) gives the page window.twin.tool('<tool>-<what>', args). See main.js for ctx.
const TOOLS = ['home', 'space', 'leftovers', 'media', 'drives', 'speed', 'rename', 'files', 'archive', 'vault', 'stats']

function register(ctx) {
  for (const name of TOOLS) require('./' + name).register(ctx)
}

module.exports = { register, TOOLS }
