# Dost Dangal

A free, browser-only 2D fighting game starring your friend group. Plain HTML, CSS and JavaScript. No build step, no dependencies, no backend.

## Play

Open `index.html` in any modern browser, or host the folder on any static host (GitHub Pages, Netlify, Vercel, a plain web server).

- **1P vs CPU** with three difficulty levels (Fresher, Senior, Warden)
- **2P on one keyboard**
- Three stages: Hostel Terrace, Canteen, College Gate
- Best of three rounds, 60 seconds each, combos, blocking, meter, specials and supers
- On-screen touch pad for phones and tablets

## Fighter Studio

Scroll to **Fighter Studio** to build fighters from your friends:

- Name, title, catchphrase, win line
- Skin, hair (12 styles), hair colour, facial hair, glasses, outfit (8 styles), two colours, hand prop
- Power / Speed / Guard sliders with a 20-point budget
- Special move (8 types) and super move (8 types), each with a custom name

Fighters are saved in the browser (`localStorage`). **Share code** exports the roster as JSON; a friend pastes it and presses Import. Up to 12 fighters.

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move | A / D | ← / → |
| Jump | W | ↑ |
| Block (hold) | S | ↓ |
| Punch | J | , or Num 1 |
| Kick | K | . or Num 2 |
| Special | L | / or Num 3 |
| Super | I | ' or Num 0 |
| Pause | Esc or P | |

## Files

- `index.html` – page markup
- `style.css` – styles
- `game.js` – engine, drawing, CPU, UI and the Fighter Studio
- `body.fragment.html` – the page body without the document shell, used for embedding

## Notes

All characters are fictional and user-created. Only add friends who are in on the joke.
