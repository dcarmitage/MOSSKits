"""Steering system with Ackermann geometry.

Ackermann steering geometry ensures that during a turn, the inner wheel
turns at a sharper angle than the outer wheel. This allows all wheels
to rotate around a common center point, reducing tire scrub.

Real race cars often use parallel or even anti-Ackermann for high-speed
cornering, but standard Ackermann is good for general use.
"""

from __future__ import annotations
import math
from dataclasses import dataclass


@dataclass
class SteeringConfig:
    """Steering system configuration."""
    # Maximum steering angle at the wheels (radians)
    max_steer_angle: float = 0.6  # ~35 degrees

    # Steering ratio (steering wheel turns per wheel turn)
    # Not used directly but useful reference
    steering_ratio: float = 15.0

    # Ackermann factor: 0 = parallel, 1 = full Ackermann
    # Real cars are typically 0.6-1.0
    # Drift cars often use less (0.3-0.6) for more predictable behavior
    ackermann_factor: float = 0.8

    # Vehicle geometry (needed for Ackermann calculation)
    wheelbase: float = 2.7
    track_width: float = 1.5

    # Steering response
    steering_rate: float = 3.0  # Max rate of steering change (rad/s)

    # Steering feel (optional smoothing)
    steering_smoothing: float = 0.0  # 0 = instant, higher = more lag


class Steering:
    """Steering system with Ackermann geometry.

    Converts steering input [-1, 1] to individual wheel angles
    for front left and front right wheels.
    """

    def __init__(self, config: SteeringConfig):
        """Initialize steering system.

        Args:
            config: Steering configuration
        """
        self.config = config

        # Current steering state
        self._current_input: float = 0.0
        self._target_input: float = 0.0

    def set_input(self, steer_input: float) -> None:
        """Set steering input.

        Args:
            steer_input: Steering input, -1 (full left) to +1 (full right)
        """
        self._target_input = max(-1.0, min(1.0, steer_input))

    def update(self, dt: float) -> None:
        """Update steering state with rate limiting.

        Args:
            dt: Time step (seconds)
        """
        # Rate limit the steering
        max_delta = self.config.steering_rate * dt / self.config.max_steer_angle

        diff = self._target_input - self._current_input
        if abs(diff) > max_delta:
            diff = math.copysign(max_delta, diff)

        self._current_input += diff

    def get_wheel_angles(self, steer_input: float = None) -> tuple[float, float]:
        """Get steering angles for front wheels.

        Uses Ackermann geometry to calculate appropriate angles
        for inner and outer wheels during a turn.

        Args:
            steer_input: Override steering input. If None, uses current state.

        Returns:
            Tuple of (left_angle, right_angle) in radians.
            Positive = turning right (counter-clockwise rotation).
        """
        if steer_input is None:
            steer_input = self._current_input

        # Base steering angle
        base_angle = steer_input * self.config.max_steer_angle

        if abs(base_angle) < 0.001:
            # Going straight
            return 0.0, 0.0

        # Parallel steering (no Ackermann)
        if self.config.ackermann_factor < 0.001:
            return base_angle, base_angle

        # Full Ackermann calculation
        # Turn radius at rear axle center
        # R = wheelbase / tan(steer_angle)
        # But we need to avoid division by zero and handle large radii

        # For small angles, use linear approximation
        if abs(base_angle) < 0.1:
            # Linear Ackermann approximation
            ackermann_correction = (
                self.config.wheelbase * base_angle /
                (2 * self.config.track_width)
            ) * self.config.ackermann_factor

            left_angle = base_angle + ackermann_correction
            right_angle = base_angle - ackermann_correction

        else:
            # Full geometric Ackermann
            try:
                # Turn radius from CG (approximation)
                R = self.config.wheelbase / math.tan(abs(base_angle))

                # Inner and outer wheel radii
                R_inner = R - self.config.track_width / 2
                R_outer = R + self.config.track_width / 2

                # Angles for each wheel
                angle_inner = math.atan(self.config.wheelbase / R_inner)
                angle_outer = math.atan(self.config.wheelbase / R_outer)

                # Blend between parallel and Ackermann
                factor = self.config.ackermann_factor

                if base_angle > 0:
                    # Turning right - left wheel is outer, right is inner
                    left_angle = abs(base_angle) * (1 - factor) + angle_outer * factor
                    right_angle = abs(base_angle) * (1 - factor) + angle_inner * factor
                    left_angle = math.copysign(left_angle, base_angle)
                    right_angle = math.copysign(right_angle, base_angle)
                else:
                    # Turning left - right wheel is outer, left is inner
                    right_angle = abs(base_angle) * (1 - factor) + angle_outer * factor
                    left_angle = abs(base_angle) * (1 - factor) + angle_inner * factor
                    left_angle = math.copysign(left_angle, base_angle)
                    right_angle = math.copysign(right_angle, base_angle)

            except (ValueError, ZeroDivisionError):
                # Fallback to parallel
                left_angle = base_angle
                right_angle = base_angle

        return left_angle, right_angle

    def get_wheel_angles_instant(self, steer_input: float) -> tuple[float, float]:
        """Get wheel angles without rate limiting or state update.

        Useful for one-off calculations.
        """
        return self.get_wheel_angles(steer_input)

    def get_turn_radius(self, steer_input: float = None) -> float:
        """Calculate approximate turn radius for current steering.

        Args:
            steer_input: Override steering input. If None, uses current state.

        Returns:
            Turn radius in meters. Returns inf for straight steering.
        """
        if steer_input is None:
            steer_input = self._current_input

        base_angle = steer_input * self.config.max_steer_angle

        if abs(base_angle) < 0.001:
            return float('inf')

        return abs(self.config.wheelbase / math.tan(base_angle))

    @property
    def current_input(self) -> float:
        """Current steering input value."""
        return self._current_input

    @property
    def target_input(self) -> float:
        """Target steering input value."""
        return self._target_input
