"""Pre-configured tire parameter sets."""

from physicskit.tire.pacejka import PacejkaParams
from physicskit.tire.tire import TireConfig


TIRE_PRESETS = {
    "sport": {
        "name": "Sport Tire",
        "description": "High-grip sport tire for spirited driving",
        "config": TireConfig.sport,
    },
    "drift": {
        "name": "Drift Tire",
        "description": "Lower grip, progressive breakaway for drifting",
        "config": TireConfig.drift,
    },
    "street": {
        "name": "Street Tire",
        "description": "Standard all-season tire",
        "config": lambda: TireConfig(
            radius=0.33,
            width=0.205,
            inertia=1.0,
            pacejka_params=PacejkaParams(
                # Moderate grip
                b0=1.5, b2=1400.0, b4=200.0, b8=-8.0,
                a0=1.2, a2=900.0, a3=950.0, a4=1.9, a7=-0.3,
                nominal_load=4000.0
            ),
            relaxation_length_x=0.45,
            relaxation_length_y=0.55,
            friction_mu=0.95
        ),
    },
    "rain": {
        "name": "Rain/Wet Tire",
        "description": "Low grip for wet conditions",
        "config": lambda: TireConfig(
            radius=0.32,
            width=0.225,
            inertia=1.0,
            pacejka_params=PacejkaParams.rain_tire(),
            relaxation_length_x=0.5,
            relaxation_length_y=0.6,
            friction_mu=0.7
        ),
    },
    "semi_slick": {
        "name": "Semi-Slick",
        "description": "Track day tire with high grip",
        "config": lambda: TireConfig(
            radius=0.31,
            width=0.265,
            inertia=1.3,
            pacejka_params=PacejkaParams(
                # High grip, sharp breakaway
                b0=1.7, b2=1900.0, b4=260.0, b8=-12.0,
                a0=1.4, a2=1200.0, a3=1250.0, a4=1.7, a7=-0.45,
                nominal_load=4500.0
            ),
            relaxation_length_x=0.25,
            relaxation_length_y=0.35,
            friction_mu=1.1
        ),
    },
}


def get_tire_config(preset_name: str) -> TireConfig:
    """Get a tire configuration by preset name.

    Args:
        preset_name: Name of the preset ('sport', 'drift', 'street', 'rain', 'semi_slick')

    Returns:
        TireConfig instance

    Raises:
        ValueError: If preset name is not found
    """
    if preset_name not in TIRE_PRESETS:
        available = ", ".join(TIRE_PRESETS.keys())
        raise ValueError(f"Unknown tire preset '{preset_name}'. Available: {available}")

    return TIRE_PRESETS[preset_name]["config"]()
