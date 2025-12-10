"""Drivetrain system with differential options.

This module handles the distribution of engine torque to the driven wheels.
For drifting, RWD (rear-wheel drive) with a limited-slip differential is
essential for controlled power slides.

Differential types:
- Open: Torque split 50/50, but wheel with less grip limits total torque
- Locked: Both wheels always rotate at same speed (good for drift initiation)
- LSD: Variable torque transfer based on speed difference
"""

from __future__ import annotations
import math
from dataclasses import dataclass
from enum import Enum


class DifferentialType(Enum):
    """Types of differential."""
    OPEN = "open"
    LOCKED = "locked"
    LSD = "lsd"  # Limited Slip Differential


class DriveType(Enum):
    """Drive configuration."""
    RWD = "rwd"  # Rear wheel drive
    FWD = "fwd"  # Front wheel drive
    AWD = "awd"  # All wheel drive


@dataclass
class DrivetrainConfig:
    """Drivetrain configuration."""
    # Drive type
    drive_type: DriveType = DriveType.RWD
    differential: DifferentialType = DifferentialType.OPEN

    # Engine
    max_torque: float = 400.0      # Peak engine torque (Nm)
    max_rpm: float = 7000.0        # Redline
    idle_rpm: float = 800.0        # Idle speed

    # Transmission (simplified - single overall ratio)
    gear_ratio: float = 3.5        # Overall gear ratio (trans * final drive)
    efficiency: float = 0.9        # Drivetrain efficiency

    # LSD parameters
    lsd_preload: float = 100.0     # Static locking torque (Nm)
    lsd_power_ratio: float = 0.3   # Locking ratio under power (0-1)
    lsd_coast_ratio: float = 0.1   # Locking ratio on coast (0-1)

    # Wheel inertia (for drivetrain inertia contribution)
    wheel_inertia: float = 1.0     # Per wheel (kg*m^2)

    # Brakes
    max_brake_torque: float = 3000.0  # Total brake torque (Nm)
    brake_bias: float = 0.65       # Front brake bias (0-1)


class Drivetrain:
    """Drivetrain system for distributing engine power.

    Handles:
    - Engine torque calculation from throttle
    - Gear ratio application
    - Differential behavior (open, locked, LSD)
    - Brake torque distribution
    """

    def __init__(self, config: DrivetrainConfig):
        """Initialize drivetrain.

        Args:
            config: Drivetrain configuration
        """
        self.config = config

        # Engine state
        self.engine_rpm: float = config.idle_rpm
        self.throttle: float = 0.0

    def set_throttle(self, throttle: float) -> None:
        """Set throttle position.

        Args:
            throttle: Throttle position, 0 to 1
        """
        self.throttle = max(0.0, min(1.0, throttle))

    def get_engine_torque(self, throttle: float = None) -> float:
        """Calculate engine torque from throttle.

        Uses a simplified torque curve that's flat near peak.

        Args:
            throttle: Override throttle. If None, uses current state.

        Returns:
            Engine torque in Nm
        """
        if throttle is None:
            throttle = self.throttle

        # Simplified torque curve (flat near peak)
        # Real engines have more complex curves
        rpm_fraction = self.engine_rpm / self.config.max_rpm
        rpm_fraction = max(0.1, min(1.0, rpm_fraction))

        # Torque curve shape (peaks around 0.6-0.8 of max RPM)
        if rpm_fraction < 0.3:
            torque_mult = 0.6 + (rpm_fraction / 0.3) * 0.4
        elif rpm_fraction < 0.8:
            torque_mult = 1.0
        else:
            torque_mult = 1.0 - (rpm_fraction - 0.8) / 0.2 * 0.3

        return throttle * self.config.max_torque * torque_mult

    def get_drive_torques(
        self,
        throttle: float,
        wheel_speeds: tuple[float, float]
    ) -> tuple[float, float]:
        """Calculate drive torque for each driven wheel.

        Args:
            throttle: Throttle position (0-1)
            wheel_speeds: Angular velocities of driven wheels (rad/s)
                         For RWD: (rear_left, rear_right)
                         For FWD: (front_left, front_right)

        Returns:
            Tuple of (left_torque, right_torque) in Nm
        """
        # Get engine torque
        engine_torque = self.get_engine_torque(throttle)

        # Apply gear ratio and efficiency
        axle_torque = engine_torque * self.config.gear_ratio * self.config.efficiency

        # Distribute based on differential type
        omega_L, omega_R = wheel_speeds

        if self.config.differential == DifferentialType.LOCKED:
            # Locked differential - equal torque split regardless of speed
            return axle_torque / 2, axle_torque / 2

        elif self.config.differential == DifferentialType.OPEN:
            # Open differential - equal torque, limited by slower wheel
            return axle_torque / 2, axle_torque / 2

        elif self.config.differential == DifferentialType.LSD:
            # Limited slip differential
            return self._calculate_lsd_torques(axle_torque, omega_L, omega_R)

        return axle_torque / 2, axle_torque / 2

    def _calculate_lsd_torques(
        self,
        axle_torque: float,
        omega_L: float,
        omega_R: float
    ) -> tuple[float, float]:
        """Calculate torques for limited slip differential.

        LSD transfers torque from the faster spinning wheel to the slower one.
        """
        # Speed difference
        delta_omega = omega_R - omega_L

        # Determine if we're in power or coast mode
        if axle_torque > 0:
            lock_ratio = self.config.lsd_power_ratio
        else:
            lock_ratio = self.config.lsd_coast_ratio

        # Locking torque (preload + speed-dependent)
        # More speed difference = more locking torque
        locking_torque = self.config.lsd_preload + abs(axle_torque) * lock_ratio

        # Base 50/50 split
        T_base = axle_torque / 2

        # Transfer torque based on speed difference
        # If right wheel is faster, transfer torque to left
        if abs(delta_omega) > 0.1:
            transfer = min(locking_torque, abs(T_base))
            if delta_omega > 0:
                # Right faster, transfer to left
                T_L = T_base + transfer * lock_ratio
                T_R = T_base - transfer * lock_ratio
            else:
                # Left faster, transfer to right
                T_L = T_base - transfer * lock_ratio
                T_R = T_base + transfer * lock_ratio
        else:
            T_L = T_base
            T_R = T_base

        return T_L, T_R

    def get_brake_torques(
        self,
        brake: float
    ) -> tuple[float, float, float, float]:
        """Calculate brake torque for each wheel.

        Args:
            brake: Brake pedal position (0-1)

        Returns:
            Tuple of (FL, FR, RL, RR) brake torques in Nm
        """
        total_brake = brake * self.config.max_brake_torque

        # Distribute based on bias
        front_brake = total_brake * self.config.brake_bias
        rear_brake = total_brake * (1 - self.config.brake_bias)

        return (
            front_brake / 2,  # FL
            front_brake / 2,  # FR
            rear_brake / 2,   # RL
            rear_brake / 2    # RR
        )

    def update_engine_rpm(
        self,
        wheel_speed: float,
        dt: float
    ) -> None:
        """Update engine RPM based on wheel speed.

        Simplified model - in reality would depend on clutch, gear selection, etc.

        Args:
            wheel_speed: Average driven wheel angular velocity (rad/s)
            dt: Time step (seconds)
        """
        # Convert wheel speed to engine RPM
        # RPM = (wheel_rad/s) * gear_ratio * 60 / (2*pi)
        target_rpm = abs(wheel_speed) * self.config.gear_ratio * 60 / (2 * math.pi)

        # Clamp to valid range
        target_rpm = max(self.config.idle_rpm, min(self.config.max_rpm, target_rpm))

        # Smooth transition
        alpha = min(1.0, dt * 5)  # Time constant ~0.2s
        self.engine_rpm += (target_rpm - self.engine_rpm) * alpha
