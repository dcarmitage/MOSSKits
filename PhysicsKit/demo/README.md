# PhysicsKit

**Multi-body physics simulation with non-linear tire physics for car drifting.**

Part of [MOSS](https://mosskits.com) - Massive Open Startup Systems.

## Quick Start

```bash
# Install
pip install -e .

# Run drift simulation
python -m physicskit drift

# Plot tire curves
python -m physicskit plot -t drift
```

## Features

- **Pacejka Magic Formula** tire model - Industry-standard non-linear tire physics
- **Combined slip handling** - Friction ellipse for simultaneous acceleration + cornering
- **4-wheel vehicle dynamics** - Weight transfer, Ackermann steering, RWD with LSD
- **Drift analysis** - Real-time drift angle, scoring, and initiation detection
- **Real-time visualization** - Pygame renderer with telemetry overlay

## Requirements

- Python 3.10+
- NumPy

Optional:
- Pygame (for visualization)
- Matplotlib (for plotting)

```bash
pip install -e ".[all]"  # Install all dependencies
```

## Usage

### Python API

```python
from physicskit import World
from physicskit.vehicle import Car, CarConfig

# Create drift-tuned car
car = Car(CarConfig.drift())
world = World(dt=0.001)
world.add_vehicle(car)

# Simulation loop
while True:
    car.set_inputs(throttle=0.8, steer=0.5, handbrake=0.0)
    world.step()

    print(f"Speed: {car.get_state().speed * 3.6:.1f} km/h")
    print(f"Drift angle: {car.get_drift_angle():.1f}°")
```

### CLI

```bash
# Show available presets
python -m physicskit info

# Run drift demo with specific vehicle
python -m physicskit drift -v muscle -s 60

# Plot tire curves
python -m physicskit plot -t sport -o tire_curves.png
```

### Controls (Drift Demo)

| Key | Action |
|-----|--------|
| W / ↑ | Throttle |
| S / ↓ | Brake |
| A / ← | Steer left |
| D / → | Steer right |
| Space | Handbrake |
| R | Reset |
| F | Toggle force vectors |
| T | Toggle telemetry |
| Esc | Quit |

## Architecture

```
physicskit/
├── core/           # Vector math, rigid body, integration
├── tire/           # Pacejka formula, slip, combined slip
├── vehicle/        # Car model, suspension, steering, drivetrain
├── drift/          # Drift metrics and detection
├── visualization/  # Pygame renderer, Matplotlib plots
└── config/         # Vehicle and tire presets
```

## Vehicle Presets

| Preset | Description |
|--------|-------------|
| `sport_coupe` | Balanced RWD sports car |
| `drift_car` | Purpose-built drifter with LSD |
| `muscle` | High power, rear-biased weight |
| `formula` | Open-wheel racer, maximum grip |
| `touring` | Tin-top racer, balanced |

## License

MIT License - see [LICENSE](../LICENSE)

---

**[MOSS](https://mosskits.com)** - Build anything.
