"""Pre-configured vehicle parameter sets."""

from physicskit.vehicle.car import CarConfig
from physicskit.vehicle.drivetrain import DifferentialType, DriveType
from physicskit.config.tire_presets import get_tire_config


VEHICLE_PRESETS = {
    "sport_coupe": {
        "name": "Sport Coupe",
        "description": "Balanced rear-wheel drive sports car",
        "config": CarConfig.sport,
    },
    "drift_car": {
        "name": "Drift Car",
        "description": "Purpose-built drift machine with LSD",
        "config": CarConfig.drift,
    },
    "muscle": {
        "name": "Muscle Car",
        "description": "High power, rear-biased weight distribution",
        "config": lambda: CarConfig(
            mass=1600.0,
            inertia=3000.0,
            wheelbase=2.85,
            track_front=1.55,
            track_rear=1.55,
            cg_height=0.52,
            cg_to_front=1.55,  # More rear weight
            tire_config=get_tire_config("sport"),
            max_steer_angle=0.55,
            ackermann_factor=0.7,
            drive_type=DriveType.RWD,
            differential=DifferentialType.OPEN,
            max_torque=550.0,  # Big V8
            gear_ratio=3.2,
            brake_bias=0.6,
            handbrake_torque=2000.0
        ),
    },
    "hot_hatch": {
        "name": "Hot Hatchback",
        "description": "Front-wheel drive with good handling",
        "config": lambda: CarConfig(
            mass=1200.0,
            inertia=1800.0,
            wheelbase=2.5,
            track_front=1.45,
            track_rear=1.42,
            cg_height=0.45,
            cg_to_front=1.15,  # Front-heavy (FWD)
            tire_config=get_tire_config("sport"),
            max_steer_angle=0.6,
            ackermann_factor=0.85,
            drive_type=DriveType.RWD,  # Simulated as RWD for now
            differential=DifferentialType.OPEN,
            max_torque=280.0,
            gear_ratio=4.0,
            brake_bias=0.7,  # More front bias
            handbrake_torque=1500.0
        ),
    },
    "formula": {
        "name": "Formula Car",
        "description": "Open-wheel racer with maximum grip",
        "config": lambda: CarConfig(
            mass=750.0,
            inertia=900.0,
            wheelbase=3.0,
            track_front=1.6,
            track_rear=1.55,
            cg_height=0.25,  # Very low CG
            cg_to_front=1.4,
            tire_config=get_tire_config("semi_slick"),
            max_steer_angle=0.4,  # Less lock, faster ratio
            ackermann_factor=0.6,
            drive_type=DriveType.RWD,
            differential=DifferentialType.LSD,
            max_torque=600.0,
            gear_ratio=3.0,
            brake_bias=0.55,
            handbrake_torque=1000.0,
            lsd_preload=200.0,
            lsd_power_ratio=0.5,
            lsd_coast_ratio=0.3
        ),
    },
    "touring": {
        "name": "Touring Car",
        "description": "Tin-top racer, balanced and predictable",
        "config": lambda: CarConfig(
            mass=1100.0,
            inertia=1600.0,
            wheelbase=2.65,
            track_front=1.5,
            track_rear=1.5,
            cg_height=0.4,
            cg_to_front=1.3,
            tire_config=get_tire_config("semi_slick"),
            max_steer_angle=0.55,
            ackermann_factor=0.75,
            drive_type=DriveType.RWD,
            differential=DifferentialType.LSD,
            max_torque=380.0,
            gear_ratio=3.6,
            brake_bias=0.58,
            handbrake_torque=1800.0,
            lsd_preload=120.0,
            lsd_power_ratio=0.35,
            lsd_coast_ratio=0.2
        ),
    },
}


def get_vehicle_config(preset_name: str) -> CarConfig:
    """Get a vehicle configuration by preset name.

    Args:
        preset_name: Name of the preset

    Returns:
        CarConfig instance

    Raises:
        ValueError: If preset name is not found
    """
    if preset_name not in VEHICLE_PRESETS:
        available = ", ".join(VEHICLE_PRESETS.keys())
        raise ValueError(f"Unknown vehicle preset '{preset_name}'. Available: {available}")

    return VEHICLE_PRESETS[preset_name]["config"]()
