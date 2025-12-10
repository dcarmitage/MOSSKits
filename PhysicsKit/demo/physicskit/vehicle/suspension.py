"""Suspension and weight transfer calculations.

This module handles the distribution of vertical load across the four wheels,
including both static weight distribution and dynamic weight transfer during
acceleration, braking, and cornering.

Weight transfer is critical for realistic handling - it determines how much
grip each tire has available.
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from enum import Enum
from typing import Dict


class WheelPosition(Enum):
    """Wheel positions on the vehicle."""
    FRONT_LEFT = "FL"
    FRONT_RIGHT = "FR"
    REAR_LEFT = "RL"
    REAR_RIGHT = "RR"


@dataclass
class WheelLoads:
    """Vertical loads on each wheel."""
    FL: float = 0.0  # Front left (N)
    FR: float = 0.0  # Front right (N)
    RL: float = 0.0  # Rear left (N)
    RR: float = 0.0  # Rear right (N)

    def get(self, pos: WheelPosition) -> float:
        """Get load for a specific wheel."""
        return getattr(self, pos.value)

    def set(self, pos: WheelPosition, value: float) -> None:
        """Set load for a specific wheel."""
        setattr(self, pos.value, value)

    def to_dict(self) -> Dict[WheelPosition, float]:
        """Convert to dictionary."""
        return {
            WheelPosition.FRONT_LEFT: self.FL,
            WheelPosition.FRONT_RIGHT: self.FR,
            WheelPosition.REAR_LEFT: self.RL,
            WheelPosition.REAR_RIGHT: self.RR,
        }

    @property
    def front_total(self) -> float:
        """Total front axle load."""
        return self.FL + self.FR

    @property
    def rear_total(self) -> float:
        """Total rear axle load."""
        return self.RL + self.RR

    @property
    def left_total(self) -> float:
        """Total left side load."""
        return self.FL + self.RL

    @property
    def right_total(self) -> float:
        """Total right side load."""
        return self.FR + self.RR

    @property
    def total(self) -> float:
        """Total load on all wheels."""
        return self.FL + self.FR + self.RL + self.RR


@dataclass
class SuspensionConfig:
    """Suspension configuration parameters."""
    # Geometry
    wheelbase: float = 2.7        # Distance between front and rear axles (m)
    track_front: float = 1.5      # Distance between front wheels (m)
    track_rear: float = 1.5       # Distance between rear wheels (m)

    # Center of gravity
    cg_height: float = 0.5        # CG height above ground (m)
    cg_to_front: float = 1.35     # Distance from CG to front axle (m)
    # cg_to_rear = wheelbase - cg_to_front

    # Mass
    total_mass: float = 1400.0    # Total vehicle mass (kg)
    gravity: float = 9.81         # Gravitational acceleration (m/s^2)

    # Anti-roll (optional, for more advanced simulation)
    front_roll_stiffness: float = 0.5  # 0-1, higher = more roll resistance
    rear_roll_stiffness: float = 0.5

    @property
    def cg_to_rear(self) -> float:
        """Distance from CG to rear axle."""
        return self.wheelbase - self.cg_to_front

    @property
    def front_weight_fraction(self) -> float:
        """Fraction of weight on front axle (static)."""
        return self.cg_to_rear / self.wheelbase

    @property
    def rear_weight_fraction(self) -> float:
        """Fraction of weight on rear axle (static)."""
        return self.cg_to_front / self.wheelbase


class Suspension:
    """Suspension system handling weight distribution and transfer.

    Calculates wheel loads based on:
    - Static weight distribution (CG position)
    - Longitudinal weight transfer (acceleration/braking)
    - Lateral weight transfer (cornering)
    """

    def __init__(self, config: SuspensionConfig):
        """Initialize suspension.

        Args:
            config: Suspension configuration
        """
        self.config = config

        # Cache static loads
        self._static_loads = self._calculate_static_loads()

    def _calculate_static_loads(self) -> WheelLoads:
        """Calculate static weight distribution."""
        total_weight = self.config.total_mass * self.config.gravity

        front_weight = total_weight * self.config.front_weight_fraction
        rear_weight = total_weight * self.config.rear_weight_fraction

        return WheelLoads(
            FL=front_weight / 2,
            FR=front_weight / 2,
            RL=rear_weight / 2,
            RR=rear_weight / 2
        )

    def get_static_loads(self) -> WheelLoads:
        """Get static wheel loads (no acceleration)."""
        return WheelLoads(
            FL=self._static_loads.FL,
            FR=self._static_loads.FR,
            RL=self._static_loads.RL,
            RR=self._static_loads.RR
        )

    def calculate_loads(
        self,
        longitudinal_accel: float,
        lateral_accel: float
    ) -> WheelLoads:
        """Calculate wheel loads with weight transfer.

        Args:
            longitudinal_accel: Forward acceleration (m/s^2, positive = forward)
            lateral_accel: Lateral acceleration (m/s^2, positive = right turn)

        Returns:
            WheelLoads with dynamic load distribution
        """
        cfg = self.config
        m = cfg.total_mass
        h = cfg.cg_height
        g = cfg.gravity

        # Start with static loads
        loads = self.get_static_loads()

        # Longitudinal weight transfer
        # Positive accel (forward) transfers weight to rear
        delta_Fz_long = m * longitudinal_accel * h / cfg.wheelbase

        # Apply to front/rear
        loads.FL -= delta_Fz_long / 2
        loads.FR -= delta_Fz_long / 2
        loads.RL += delta_Fz_long / 2
        loads.RR += delta_Fz_long / 2

        # Lateral weight transfer
        # Positive accel (right turn) transfers weight to left
        # Calculate for front and rear axles separately

        # Front axle lateral transfer
        front_weight = loads.FL + loads.FR
        if cfg.track_front > 0:
            delta_Fz_lat_front = (
                m * lateral_accel * h *
                cfg.front_weight_fraction / cfg.track_front
            )
            # Adjust for roll stiffness distribution
            delta_Fz_lat_front *= cfg.front_roll_stiffness / (
                cfg.front_roll_stiffness + cfg.rear_roll_stiffness + 0.001
            ) * 2

            loads.FL += delta_Fz_lat_front
            loads.FR -= delta_Fz_lat_front

        # Rear axle lateral transfer
        if cfg.track_rear > 0:
            delta_Fz_lat_rear = (
                m * lateral_accel * h *
                cfg.rear_weight_fraction / cfg.track_rear
            )
            delta_Fz_lat_rear *= cfg.rear_roll_stiffness / (
                cfg.front_roll_stiffness + cfg.rear_roll_stiffness + 0.001
            ) * 2

            loads.RL += delta_Fz_lat_rear
            loads.RR -= delta_Fz_lat_rear

        # Clamp all loads to non-negative (wheel lift)
        loads.FL = max(0.0, loads.FL)
        loads.FR = max(0.0, loads.FR)
        loads.RL = max(0.0, loads.RL)
        loads.RR = max(0.0, loads.RR)

        return loads

    def calculate_loads_simple(
        self,
        longitudinal_accel: float,
        lateral_accel: float
    ) -> WheelLoads:
        """Simplified weight transfer calculation.

        Uses a simpler model that's faster to compute and easier to tune.
        Good for initial development.
        """
        cfg = self.config
        m = cfg.total_mass
        h = cfg.cg_height
        g = cfg.gravity
        total_weight = m * g

        # Static distribution
        front_frac = cfg.front_weight_fraction
        rear_frac = cfg.rear_weight_fraction

        # Longitudinal transfer
        long_transfer = m * longitudinal_accel * h / cfg.wheelbase

        # Lateral transfer
        lat_transfer_front = m * lateral_accel * h * front_frac / cfg.track_front
        lat_transfer_rear = m * lateral_accel * h * rear_frac / cfg.track_rear

        # Calculate each wheel
        loads = WheelLoads(
            FL=total_weight * front_frac / 2 - long_transfer / 2 + lat_transfer_front,
            FR=total_weight * front_frac / 2 - long_transfer / 2 - lat_transfer_front,
            RL=total_weight * rear_frac / 2 + long_transfer / 2 + lat_transfer_rear,
            RR=total_weight * rear_frac / 2 + long_transfer / 2 - lat_transfer_rear,
        )

        # Clamp
        loads.FL = max(0.0, loads.FL)
        loads.FR = max(0.0, loads.FR)
        loads.RL = max(0.0, loads.RL)
        loads.RR = max(0.0, loads.RR)

        return loads
