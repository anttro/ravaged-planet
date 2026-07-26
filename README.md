# Ravaged Planet

A modern [Scorched Earth](https://en.wikipedia.org/wiki/Scorched_Earth_(video_game)) clone.

[Play it now](https://ravaged-planet.atroshin.ru)

![A screenshot of the game](docs/screenshot.png)

## How to play

Tanks take turns to shoot at other tanks. The last surviving tank wins the round. Player 1 (red) is controlled via the keyboard, while other players are randomly-picked AIs.

Use the start menu to configure players (2-6), rounds (1/3/5/10), and terrain type before each battle. Between rounds, visit the market to spend your score on weapons.

### Controls

| Key | Function | With Shift | With Alt |
|-|-|-|-|
| Up/Down | Increase/decrease firing power | Increase/decrease by 10 | Increase/decrease slowly |
| Left/Right | Aim higher/lower | Increase/decrease by 10 | Increase/decrease slowly |
| Tab | Switch to your next weapon | Switch to your previous weapon | |
| Space | Fire | | |

### Market controls

| Key | Function |
|-|-|
| Up/Down | Navigate items |
| Right | Buy item |
| Left | Sell item (full price refund) |
| Enter | Start round |

## Features

- [X] Up to six players with menu configuration
- [X] Multi-round battles with score tracking
- [X] Weapons & tools market (buy/sell)
- [X] Napalm weapons with liquid physics, fire propagation, and smoke effects
- [X] Animated terrain collapse (pixel-level gravity simulation)
- [X] Colorful retro graphics with 8×16 / 8×8 bitmap fonts
- [X] Frame-rate independent physics
- [X] Special graphic effects
- [X] Bullet physics, traces and sounds
- [X] Randomly generated terrains (Mountain, Sand)
- [X] Wide assortment of weapons
- [ ] Wide assortment of tools (only shields and parachutes implemented)
- [ ] Many different tanks to pick from
- [ ] Many AIs to battle against (only Moron and Chooser implemented)
- [ ] Configuration
- [ ] Local Multiplayer
- [ ] Internet Multiplayer

## What's new

This fork adds significant enhancements over the original game:

- Canvas-drawn UI panels for start menu, market, round-end, and game-over screens
- Full mouse and touchscreen support for all menus and in-game controls
- Multi-round battles with persistent score tracking and weapon purchasing
- Redesigned in-game controls: angle gauge, vertical power bar, and fire button
- Improved visual effects: lava lamp explosions, enhanced flame animation, and particle effects
- Round-end and game-over tables showing detailed player statistics
- Terrain collapse animation runs at twice the speed
- Permanent tracer mode option

## Weapons

| Weapon | Projectile | Effect | Price |
|-|-|-|-|
| Tracer | Normal | Light tracer round, no blast | FREE |
| Baby Missile | Normal | Small blast (r=5) | FREE |
| Missile | Normal | Medium blast (r=20) | $15 |
| Baby Nuke | Normal | Large blast (r=50) | $25 |
| Nuke | Normal | Huge blast (r=100) | $50 |
| Napalm | Normal | Emits 32 napalm particles, fire burns 3s | $20 |
| Hot Napalm | Normal | Emits 64 napalm particles, fire burns 3s | $40 |
| Baby Roller | Roller | Bouncing roller, small blast (r=15) | $15 |
| Roller | Roller | Bouncing roller, medium blast (r=35) | $25 |
| Super Roller | Roller | Bouncing roller, large blast (r=60) | $40 |
| MIRV | MIRV (3-way) | Triple split shot | $25 |
| X-MIRV | MIRV (5-way) | Five-way split shot | $50 |
| Leapfrog | Leapfrog (3 bounces) | Bounces 3 times, progressive power | $25 |
| Super Leapfrog | Leapfrog (6 bounces) | Bounces 6 times, progressive power | $40 |
| Small Dirt | Normal | Dirt spray (r=25), no damage | $10 |
| Dirt | Normal | Dirt spray (r=50), no damage | $20 |
| Ton of Dirt | Normal | Dirt spray (r=75), no damage | $35 |
| Small Dig Bomb | Normal | Digs crater (r=25), no damage | $10 |
| Dig Bomb | Normal | Digs crater (r=50), no damage | $20 |
| Large Dig Bomb | Normal | Digs crater (r=75), no damage | $35 |

### Tools

| Tool | Effect | Price |
|-|-|-|
| Parachute | Reduces fall damage | $30 |

## License

Licensed under the MIT LICENSE.

Original game (c) 2019 zenoamaro <zenoamaro@gmail.com>
This fork is meant to enhance original game.
