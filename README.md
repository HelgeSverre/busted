# Busted

Museum heist as a noseless marble bust. Sneak past guards, cameras and lasers, collect three keys, and stand still when someone looks: they think you're art.

**Play it:** https://busted-one.vercel.app

## Made by Claude Fable 5.2

Busted was written by Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code, from one prompt. It came right after [Mizzle](https://github.com/HelgeSverre/mizzle), in the same session. Every assistant turn in that session was Fable 5.2, and there were no follow-up prompts about the game; the only other message was "deploy it to vercel".

The prompt, verbatim:

> do another one in fable-demo-game2/ entierly seperate and new idea, higher ambitious level and rendering fidellity

"Another one" refers to the Mizzle prompt:

> I want you to go nuts and create me an impressive, quirkey/charming full game that pushes the envelope of what AI-developed games are, is visually impressive and NOT something that i have already done already in my code folder, it must be an original creative work, no lighthouses or boats allowed, other than that, go nuts, i wanna be wow-ed, put in fable-demo-game/

The game has no image, model or audio files. The busts and statues are sculpted from signed distance functions and meshed at load time, and the heist-jazz score and sound effects are synthesized with the Web Audio API.

## How to play

You are a Roman marble bust whose nose went missing. It is night, and the museum's lab has a shelf of replacement noses behind a locked door. Get in, pick a nose, and get back out.

- Three keys open the lab door. They are hidden in the gallery, the modern wing and the dinosaur hall. The modern-wing key only appears after you solve the floor-tile puzzle there.
- Guards, security cameras, a dozing night guard, a dinosaur skeleton and a roomba are all watching. If they see you move, you get caught and put back on the nearest plinth in that room. Keys you already have stay collected.
- Stand still and you are a sculpture. Guards will start to doubt you, then decide you must be new. Plinths and the art rooms are the safest places to freeze.
- The gallery has laser beams. Touching one sets off the alarm.
- In the lab, walk up to a nose and press <kbd>E</kbd> to wear it. You can swap as often as you like. Leave the lab wearing one to finish.

The end screen shows the label for the nose you chose, your time, and how many times you were re-shelved.

## Controls

| Key | Action |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrow keys | Hop around |
| <kbd>Shift</kbd> (hold) | Tiptoe: shorter, quieter hops |
| <kbd>E</kbd>, <kbd>Space</kbd> or <kbd>Enter</kbd> | Pick up or swap a nose |
| <kbd>M</kbd> | Mute |
| Any key or click | Start |

## Run locally

```sh
bun install
bun run build      # bundles src/ into dist/game.js
bunx serve .       # or any static server, then open the printed URL
```

`bun run dev` rebuilds `dist/game.js` on every change. `dist/game.js` is committed because the Vercel deploy serves the repo as static files with no build step (see `vercel.json`).

## Code

| File | What it does |
|---|---|
| `src/main.js` | Game loop, input, detection, keys, door, ending |
| `src/museum.js` | The building: rooms, plinths, spawn points |
| `src/actors.js` | Hero, guards, cameras, lasers, dinosaur, roomba, noses |
| `src/sdf.js`, `src/sculpt.js` | Signed distance functions and the surface-nets mesher |
| `src/render.js`, `src/tex.js` | Renderer, lighting, procedural textures |
| `src/audio.js` | Generative heist jazz and sound effects |
| `src/ui.js` | HUD, speech bubbles, title and end screens |
| `src/kit.js`, `src/noise.js`, `src/util.js` | Shared helpers |

## License

[MIT](LICENSE)
