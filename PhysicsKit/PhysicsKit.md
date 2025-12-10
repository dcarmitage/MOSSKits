# PhysicsKit - Full Specification

Multi-body physics simulation with non-linear tire physics for car drifting.

## What is PhysicsKit?

PhysicsKit is a Python physics simulation package designed for realistic vehicle dynamics, with a focus on drifting. It implements:

- **Pacejka Magic Formula** - The industry-standard empirical tire model
- **Multi-body dynamics** - Rigid body simulation with proper integration
- **Combined slip handling** - Friction ellipse model for realistic tire behavior
- **Vehicle subsystems** - Suspension, steering, drivetrain, handbrake
- **Drift analysis** - Metrics, scoring, and state detection

## Quick Start

```python
from physicskit import World
from physicskit.vehicle import Car, CarConfig
from physicskit.visualization import PygameRenderer

# Create simulation
car = Car(CarConfig.drift())
world = World(dt=0.001)
world.add_vehicle(car)
renderer = PygameRenderer()

# Main loop
while True:
    inputs = renderer.handle_input()
    car.set_inputs(**inputs)
    world.step_fixed(1/60)
    renderer.render(car)
```

## Architecture

### Core Physics (`physicskit/core/`)

**Vector3** - 3D vector with standard operations:
```python
from physicskit.core import Vector3

v = Vector3(1, 2, 0)
v_rotated = v.rotate_z(math.pi / 4)
v_normalized = v.normalized()
```

**RigidBody** - 2D rigid body dynamics:
```python
from physicskit.core import RigidBody

body = RigidBody(mass=1400, inertia=2500)
body.apply_force(Vector3(1000, 0, 0))
body.integrate(dt=0.001)
```

**World** - Simulation manager with fixed timestep:
```python
from physicskit.core import World

world = World(dt=0.001)
world.add_vehicle(car)
world.step_fixed(real_dt)  # Fixed timestep with accumulator
```

### Tire Physics (`physicskit/tire/`)

**Pacejka Magic Formula**:
```
F = D * sin(C * arctan(B*x - E*(B*x - arctan(B*x))))
```

Where:
- B = Stiffness factor
- C = Shape factor
- D = Peak value
- E = Curvature factor
- x = slip (ratio or angle)

```python
from physicskit.tire import PacejkaFormula, PacejkaParams

params = PacejkaParams.drift_tire()
pacejka = PacejkaFormula(params)

# Get lateral force at 10° slip, 4000N load
Fy = pacejka.lateral_force(slip_angle=10, Fz=4000)
```

**Combined Slip** - Friction ellipse model:
```python
from physicskit.tire import CombinedSlip

combined = CombinedSlip(pacejka)
forces = combined.calculate(
    slip_ratio=0.1,
    slip_angle_deg=15,
    Fz=4000
)
print(f"Fx={forces.Fx:.0f}N, Fy={forces.Fy:.0f}N")
```

**Tire Relaxation** - First-order lag dynamics:
```python
from physicskit.tire import TireRelaxation

relax = TireRelaxation(relaxation_length=0.5)
Fx, Fy = relax.update(target_Fx, target_Fy, velocity, dt)
```

### Vehicle Dynamics (`physicskit/vehicle/`)

**Car** - Complete vehicle model:
```python
from physicskit.vehicle import Car, CarConfig

config = CarConfig(
    mass=1400,
    wheelbase=2.7,
    max_torque=400,
    differential=DifferentialType.LSD
)
car = Car(config)

car.set_inputs(throttle=0.8, brake=0, steer=0.3, handbrake=0)
car.physics_step(dt=0.001)

state = car.get_state()
print(f"Speed: {state.speed * 3.6:.1f} km/h")
print(f"Drift angle: {car.get_drift_angle():.1f}°")
```

**Suspension** - Weight transfer calculation:
```python
from physicskit.vehicle import Suspension, SuspensionConfig

suspension = Suspension(SuspensionConfig(wheelbase=2.7, track_front=1.5))
loads = suspension.calculate_loads(
    longitudinal_accel=3.0,  # m/s²
    lateral_accel=8.0        # m/s²
)
print(f"FL: {loads.FL:.0f}N, FR: {loads.FR:.0f}N")
```

**Drivetrain** - Engine + differential:
```python
from physicskit.vehicle import Drivetrain, DrivetrainConfig, DifferentialType

drivetrain = Drivetrain(DrivetrainConfig(
    differential=DifferentialType.LSD,
    max_torque=450
))
left_torque, right_torque = drivetrain.get_drive_torques(
    throttle=0.8,
    wheel_speeds=(50, 55)  # rad/s
)
```

### Drift Analysis (`physicskit/drift/`)

**DriftMetrics** - Drift quality measurement:
```python
from physicskit.drift import DriftAnalyzer

analyzer = DriftAnalyzer()
metrics = analyzer.update(
    velocity=car.body.velocity,
    orientation=car.body.orientation,
    steer_angle_deg=steer * 35,
    throttle=throttle,
    yaw_rate=car.body.angular_velocity,
    speed=car.get_state().speed,
    dt=dt,
    sim_time=time
)

print(f"Drift angle: {metrics.drift_angle:.1f}°")
print(f"Score: {metrics.overall_score:.0f}")
print(f"Drifting: {metrics.is_drifting}")
```

**DriftDetector** - State machine for drift phases:
```python
from physicskit.drift import DriftDetector, DriftState

detector = DriftDetector()
state = detector.update(
    drift_angle=30,
    drift_angle_rate=10,
    speed=20,
    throttle=0.8,
    brake=0,
    steer=-0.3,
    handbrake=0,
    rear_slip_L=25, rear_slip_R=28,
    front_slip_L=8, front_slip_R=6,
    sim_time=time
)

print(f"State: {state.drift_state}")  # DriftState.DRIFTING
print(f"Initiation: {state.initiation}")  # DriftInitiation.HANDBRAKE
```

### Visualization (`physicskit/visualization/`)

**PygameRenderer** - Real-time 2D view:
```python
from physicskit.visualization import PygameRenderer, RenderConfig

config = RenderConfig(
    width=1280,
    height=720,
    scale=15.0,
    show_forces=True
)
renderer = PygameRenderer(config)
renderer.init()

while running:
    inputs = renderer.handle_input()
    renderer.render(car, drift_metrics)
```

**TirePlotter** - Matplotlib force curves:
```python
from physicskit.visualization import TirePlotter

fig = TirePlotter.plot_lateral_force(
    pacejka,
    loads=[2000, 4000, 6000, 8000]
)
fig.savefig('tire_curves.png')
```

## Data Model

### TireState
```python
@dataclass
class TireState:
    slip_ratio: float      # Longitudinal slip [-1, 1]
    slip_angle: float      # Lateral slip (radians)
    slip_angle_deg: float  # Lateral slip (degrees)
    Fx: float              # Longitudinal force (N)
    Fy: float              # Lateral force (N)
    Fz: float              # Normal load (N)
    saturation: float      # Friction usage (0-1)
    angular_velocity: float  # Wheel spin (rad/s)
```

### CarState
```python
@dataclass
class CarState:
    position: Vector3
    orientation: float     # radians
    velocity: Vector3
    angular_velocity: float  # rad/s
    speed: float           # m/s
    forward_speed: float   # m/s
    lateral_speed: float   # m/s
    longitudinal_accel: float  # m/s²
    lateral_accel: float   # m/s²
    wheel_loads: WheelLoads
    tire_FL: TireState
    tire_FR: TireState
    tire_RL: TireState
    tire_RR: TireState
    throttle: float
    brake: float
    steer: float
    handbrake: float
```

### DriftMetrics
```python
@dataclass
class DriftMetrics:
    drift_angle: float        # degrees
    drift_angle_rate: float   # deg/s
    drift_direction: int      # -1, 0, +1
    speed: float              # m/s
    is_drifting: bool
    drift_duration: float     # seconds
    angle_stability: float    # 0-1
    overall_score: float      # 0-100
```

## Configuration

### CarConfig
```python
CarConfig(
    mass=1400.0,           # kg
    inertia=2500.0,        # kg*m² (yaw)
    wheelbase=2.7,         # m
    track_front=1.5,       # m
    track_rear=1.5,        # m
    cg_height=0.5,         # m
    cg_to_front=1.35,      # m
    tire_config=TireConfig.drift(),
    max_steer_angle=0.6,   # radians
    ackermann_factor=0.8,  # 0-1
    drive_type=DriveType.RWD,
    differential=DifferentialType.LSD,
    max_torque=400.0,      # Nm
    gear_ratio=3.5,
    max_brake_torque=3000.0,  # Nm
    brake_bias=0.65,       # front bias
    handbrake_torque=2000.0,  # Nm
    lsd_preload=100.0,     # Nm
    lsd_power_ratio=0.3,   # 0-1
    lsd_coast_ratio=0.1    # 0-1
)
```

### TireConfig
```python
TireConfig(
    radius=0.32,           # m
    width=0.225,           # m
    inertia=1.0,           # kg*m²
    pacejka_params=PacejkaParams.drift_tire(),
    relaxation_length_x=0.4,  # m
    relaxation_length_y=0.5,  # m
    friction_mu=1.0        # multiplier
)
```

## Presets

### Vehicle Presets
- `sport_coupe` - Balanced RWD sports car
- `drift_car` - Purpose-built drifter with LSD
- `muscle` - High power muscle car
- `formula` - Open-wheel racer
- `touring` - Tin-top racer

### Tire Presets
- `sport` - High-grip sport tire
- `drift` - Lower grip, progressive breakaway
- `street` - Standard all-season
- `rain` - Wet conditions
- `semi_slick` - Track day tire

## Key Algorithms

### Pacejka Magic Formula
```python
def magic_formula(x, B, C, D, E, Sh=0, Sv=0):
    x1 = x + Sh
    Bx1 = B * x1
    return D * sin(C * atan(Bx1 - E * (Bx1 - atan(Bx1)))) + Sv
```

### Slip Ratio
```python
def slip_ratio(ground_velocity, wheel_angular_velocity, wheel_radius):
    wheel_velocity = wheel_angular_velocity * wheel_radius
    reference = max(abs(ground_velocity), abs(wheel_velocity), 0.5)
    return (wheel_velocity - ground_velocity) / reference
```

### Weight Transfer
```python
# Longitudinal
delta_Fz_long = mass * accel_x * cg_height / wheelbase

# Lateral
delta_Fz_lat = mass * accel_y * cg_height / track_width
```

### Semi-Implicit Euler
```python
def integrate(body, dt):
    acceleration = force / mass
    body.velocity += acceleration * dt  # Update velocity FIRST
    body.position += body.velocity * dt  # Then position with NEW velocity
```

## Project Structure

```
PhysicsKit/
├── physicskit/
│   ├── __init__.py
│   ├── __main__.py          # CLI
│   ├── core/
│   │   ├── vector.py        # Vector3 math
│   │   ├── rigid_body.py    # RigidBody class
│   │   ├── integrators.py   # Semi-implicit Euler, RK4
│   │   └── world.py         # Simulation world
│   ├── tire/
│   │   ├── pacejka.py       # Magic Formula
│   │   ├── slip.py          # Slip calculations
│   │   ├── combined.py      # Friction ellipse
│   │   ├── relaxation.py    # Tire dynamics
│   │   └── tire.py          # Complete tire
│   ├── vehicle/
│   │   ├── car.py           # Vehicle model
│   │   ├── suspension.py    # Weight transfer
│   │   ├── steering.py      # Ackermann
│   │   ├── drivetrain.py    # Engine + diff
│   │   └── handbrake.py     # Handbrake
│   ├── drift/
│   │   ├── metrics.py       # Drift scoring
│   │   └── detection.py     # State detection
│   ├── visualization/
│   │   ├── renderer.py      # Pygame view
│   │   └── plotter.py       # Matplotlib
│   └── config/
│       ├── tire_presets.py
│       └── vehicle_presets.py
├── examples/
│   ├── drift_demo.py
│   └── tire_curves.py
├── tests/
├── pyproject.toml
├── requirements.txt
└── README.md
```

## References

- Pacejka, H. B. "Tire and Vehicle Dynamics" (2012)
- [Pacejka '94 Parameters Explained](https://www.edy.es/dev/docs/pacejka-94-parameters-explained-a-comprehensive-guide/)
- [MATLAB Tire-Road Interaction](https://www.mathworks.com/help/sdl/ref/tireroadinteractionmagicformula.html)

---

**[MOSS](https://mosskits.com)** - Build anything.
