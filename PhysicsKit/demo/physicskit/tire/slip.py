"""Tire slip calculations for longitudinal and lateral slip."""

from __future__ import annotations
import math
from dataclasses import dataclass

from physicskit.core.vector import Vector3


@dataclass
class SlipState:
    """Current slip state of a tire."""
    slip_ratio: float = 0.0      # Longitudinal slip [-1, inf)
    slip_angle: float = 0.0      # Lateral slip angle (radians)
    slip_angle_deg: float = 0.0  # Lateral slip angle (degrees)
    combined_slip: float = 0.0   # Combined slip magnitude


class SlipCalculator:
    """Calculate tire slip quantities from wheel and ground velocities."""

    # Minimum velocity threshold to avoid division by zero
    MIN_VELOCITY: float = 0.5  # m/s

    @staticmethod
    def slip_ratio(
        ground_velocity: float,
        wheel_angular_velocity: float,
        wheel_radius: float,
        epsilon: float = 0.5
    ) -> float:
        """Calculate longitudinal slip ratio.

        Slip ratio represents the difference between wheel rotation speed
        and actual ground speed, normalized by the larger of the two.

        For braking (ground speed > wheel speed):
            SR = (Vx - omega*R) / max(|Vx|, epsilon)
            Range: [0, 1], where 1 = locked wheel

        For acceleration (wheel speed > ground speed):
            SR = (omega*R - Vx) / max(|omega*R|, epsilon)
            Range: [0, inf), where inf = spinning on ice

        Convention used here:
            SR = (omega*R - Vx) / max(|Vx|, |omega*R|, epsilon)
            Positive = acceleration, Negative = braking

        Args:
            ground_velocity: Forward velocity at contact patch (m/s)
            wheel_angular_velocity: Wheel rotation rate (rad/s)
            wheel_radius: Wheel radius (m)
            epsilon: Minimum denominator to prevent division by zero

        Returns:
            Slip ratio, typically clamped to [-1, 1] for stability
        """
        wheel_velocity = wheel_angular_velocity * wheel_radius

        # Use the larger of ground or wheel velocity as reference
        # This provides better numerical behavior
        reference = max(abs(ground_velocity), abs(wheel_velocity), epsilon)

        slip = (wheel_velocity - ground_velocity) / reference

        # Clamp to reasonable range for stability
        return max(-1.0, min(1.0, slip))

    @staticmethod
    def slip_ratio_extended(
        ground_velocity: float,
        wheel_angular_velocity: float,
        wheel_radius: float,
        epsilon: float = 0.5
    ) -> float:
        """Calculate slip ratio without clamping.

        Same as slip_ratio but allows values outside [-1, 1] for
        more accurate modeling of extreme slip conditions.
        """
        wheel_velocity = wheel_angular_velocity * wheel_radius
        reference = max(abs(ground_velocity), abs(wheel_velocity), epsilon)
        return (wheel_velocity - ground_velocity) / reference

    @staticmethod
    def slip_angle(
        velocity: Vector3,
        wheel_heading: float,
        epsilon: float = 0.5
    ) -> float:
        """Calculate lateral slip angle.

        Slip angle is the angle between the tire's heading direction
        and its actual velocity direction. This creates a lateral force.

        alpha = arctan(Vy / Vx) for velocity in tire frame
              = velocity_angle - wheel_heading for velocity in world frame

        Args:
            velocity: Velocity vector at tire contact patch (world frame)
            wheel_heading: Direction tire is pointing (radians, world frame)
            epsilon: Minimum velocity to calculate slip angle

        Returns:
            Slip angle in radians
        """
        speed = velocity.magnitude_2d()

        if speed < epsilon:
            return 0.0

        # Velocity angle in world frame
        velocity_angle = math.atan2(velocity.y, velocity.x)

        # Slip angle is difference between velocity and heading
        slip = velocity_angle - wheel_heading

        # Normalize to [-pi, pi]
        while slip > math.pi:
            slip -= 2 * math.pi
        while slip < -math.pi:
            slip += 2 * math.pi

        return slip

    @staticmethod
    def slip_angle_from_local_velocity(
        local_velocity: Vector3,
        epsilon: float = 0.5
    ) -> float:
        """Calculate slip angle from velocity in tire's local frame.

        In the tire frame:
        - X is forward (wheel heading direction)
        - Y is lateral (to the right)

        alpha = arctan(Vy / Vx)

        Args:
            local_velocity: Velocity in tire's local coordinate frame
            epsilon: Minimum forward velocity

        Returns:
            Slip angle in radians
        """
        vx = local_velocity.x
        vy = local_velocity.y

        # At very low forward speeds, slip angle becomes undefined
        if abs(vx) < epsilon:
            if abs(vy) < epsilon:
                return 0.0
            # Moving mostly sideways
            return math.copysign(math.pi / 2, vy)

        return math.atan2(vy, vx)

    @staticmethod
    def combined_slip_magnitude(slip_ratio: float, slip_angle: float) -> float:
        """Calculate combined slip magnitude.

        This represents the total slip as a scalar, used for
        combined slip force calculations.

        sigma = sqrt(SR^2 + tan(alpha)^2)

        For small angles, tan(alpha) ≈ alpha, so:
        sigma ≈ sqrt(SR^2 + alpha^2)

        Args:
            slip_ratio: Longitudinal slip ratio
            slip_angle: Lateral slip angle in radians

        Returns:
            Combined slip magnitude
        """
        tan_alpha = math.tan(slip_angle) if abs(slip_angle) < math.pi / 2 - 0.01 else 100.0
        return math.sqrt(slip_ratio * slip_ratio + tan_alpha * tan_alpha)

    @classmethod
    def calculate_slip(
        cls,
        contact_velocity: Vector3,
        wheel_heading: float,
        wheel_angular_velocity: float,
        wheel_radius: float
    ) -> SlipState:
        """Calculate complete slip state for a tire.

        Args:
            contact_velocity: Velocity at contact patch (world frame)
            wheel_heading: Direction tire is pointing (radians)
            wheel_angular_velocity: Wheel rotation rate (rad/s)
            wheel_radius: Wheel radius (m)

        Returns:
            SlipState with all slip quantities
        """
        # Project velocity onto wheel heading for longitudinal component
        heading_vec = Vector3(math.cos(wheel_heading), math.sin(wheel_heading), 0)
        forward_velocity = contact_velocity.dot(heading_vec)

        # Calculate slip ratio
        sr = cls.slip_ratio(forward_velocity, wheel_angular_velocity, wheel_radius)

        # Calculate slip angle
        sa = cls.slip_angle(contact_velocity, wheel_heading)
        sa_deg = math.degrees(sa)

        # Combined slip
        combined = cls.combined_slip_magnitude(sr, sa)

        return SlipState(
            slip_ratio=sr,
            slip_angle=sa,
            slip_angle_deg=sa_deg,
            combined_slip=combined
        )
