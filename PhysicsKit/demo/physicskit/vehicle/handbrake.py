"""Handbrake system for drift initiation.

The handbrake (emergency/parking brake) applies braking force only to the
rear wheels. This is essential for drift driving techniques like:

- Handbrake turns: Sharp direction changes at low speed
- Drift initiation: Breaking rear traction to start a slide
- Drift angle adjustment: Increasing slide angle mid-drift

The handbrake can lock the rear wheels completely, which breaks traction
but also eliminates steering control from the rear.
"""

from __future__ import annotations
import math
from dataclasses import dataclass


@dataclass
class HandbrakeConfig:
    """Handbrake configuration."""
    # Maximum torque when fully engaged (Nm)
    max_torque: float = 2000.0

    # Engagement characteristics
    engagement_rate: float = 10.0   # How fast it engages (1/s)
    release_rate: float = 15.0      # How fast it releases (1/s)

    # Whether handbrake can lock wheels completely
    can_lock_wheels: bool = True

    # Minimum wheel speed to consider locked (rad/s)
    lock_threshold: float = 0.5


class Handbrake:
    """Handbrake system for rear wheel braking.

    Provides progressive engagement/release for more realistic feel,
    and tracks whether wheels are locked.
    """

    def __init__(self, config: HandbrakeConfig = None):
        """Initialize handbrake.

        Args:
            config: Handbrake configuration. Uses defaults if None.
        """
        self.config = config or HandbrakeConfig()

        # Current engagement level (0-1)
        self._engagement: float = 0.0

        # Target engagement from input
        self._target: float = 0.0

        # Wheel lock state
        self._left_locked: bool = False
        self._right_locked: bool = False

    def set_input(self, input_value: float) -> None:
        """Set handbrake input.

        Args:
            input_value: Handbrake lever position, 0 (released) to 1 (full)
        """
        self._target = max(0.0, min(1.0, input_value))

    def update(self, dt: float) -> None:
        """Update handbrake engagement.

        Args:
            dt: Time step (seconds)
        """
        if self._target > self._engagement:
            # Engaging
            rate = self.config.engagement_rate
            self._engagement = min(
                self._target,
                self._engagement + rate * dt
            )
        else:
            # Releasing
            rate = self.config.release_rate
            self._engagement = max(
                self._target,
                self._engagement - rate * dt
            )

    def get_brake_torques(
        self,
        wheel_speeds: tuple[float, float] = None
    ) -> tuple[float, float]:
        """Get brake torque for rear wheels.

        Args:
            wheel_speeds: Optional (left, right) wheel angular velocities.
                         Used to determine if wheels should lock.

        Returns:
            Tuple of (left_torque, right_torque) in Nm.
            Always positive (opposes rotation).
        """
        base_torque = self._engagement * self.config.max_torque

        # Check for wheel locking
        if wheel_speeds is not None and self.config.can_lock_wheels:
            omega_L, omega_R = wheel_speeds

            # If engagement is high and wheel speed is low, consider locked
            if self._engagement > 0.8:
                self._left_locked = abs(omega_L) < self.config.lock_threshold
                self._right_locked = abs(omega_R) < self.config.lock_threshold
            else:
                self._left_locked = False
                self._right_locked = False

        return base_torque, base_torque

    def get_torque_with_direction(
        self,
        wheel_speeds: tuple[float, float]
    ) -> tuple[float, float]:
        """Get signed brake torque that opposes wheel rotation.

        Args:
            wheel_speeds: (left, right) wheel angular velocities (rad/s)

        Returns:
            Tuple of (left_torque, right_torque) with signs to oppose rotation
        """
        base_L, base_R = self.get_brake_torques(wheel_speeds)
        omega_L, omega_R = wheel_speeds

        # Apply torque opposing rotation
        torque_L = -math.copysign(base_L, omega_L) if abs(omega_L) > 0.1 else 0.0
        torque_R = -math.copysign(base_R, omega_R) if abs(omega_R) > 0.1 else 0.0

        return torque_L, torque_R

    @property
    def engagement(self) -> float:
        """Current engagement level (0-1)."""
        return self._engagement

    @property
    def is_engaged(self) -> bool:
        """Whether handbrake is engaged at all."""
        return self._engagement > 0.01

    @property
    def is_fully_engaged(self) -> bool:
        """Whether handbrake is fully engaged."""
        return self._engagement > 0.95

    @property
    def left_locked(self) -> bool:
        """Whether left rear wheel is locked."""
        return self._left_locked

    @property
    def right_locked(self) -> bool:
        """Whether right rear wheel is locked."""
        return self._right_locked

    @property
    def both_locked(self) -> bool:
        """Whether both rear wheels are locked."""
        return self._left_locked and self._right_locked

    def reset(self) -> None:
        """Reset handbrake to released state."""
        self._engagement = 0.0
        self._target = 0.0
        self._left_locked = False
        self._right_locked = False
