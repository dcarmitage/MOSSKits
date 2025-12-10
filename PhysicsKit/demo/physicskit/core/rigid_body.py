"""Rigid body dynamics for 2D vehicle simulation."""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional

from physicskit.core.vector import Vector3, normalize_angle


@dataclass
class RigidBody:
    """2D rigid body with mass, inertia, position, and velocities.

    Uses a simplified 2D model where:
    - Position is in the XY plane (z=0)
    - Orientation is yaw angle (rotation around Z axis)
    - Angular velocity is yaw rate
    """

    # Physical properties
    mass: float = 1000.0  # kg
    inertia: float = 2000.0  # kg*m^2 (yaw moment of inertia)

    # State
    position: Vector3 = field(default_factory=Vector3)
    orientation: float = 0.0  # radians (yaw angle)
    velocity: Vector3 = field(default_factory=Vector3)
    angular_velocity: float = 0.0  # rad/s (yaw rate)

    # Force/torque accumulators (reset each step)
    _force: Vector3 = field(default_factory=Vector3)
    _torque: float = 0.0

    def apply_force(self, force: Vector3, world_point: Optional[Vector3] = None) -> None:
        """Apply force at a world point (or center of mass if None).

        Args:
            force: Force vector in world coordinates (Newtons)
            world_point: Point of application in world coordinates.
                        If None, force is applied at center of mass (no torque).
        """
        self._force += force

        if world_point is not None:
            # Calculate torque from force applied off-center
            r = world_point - self.position
            # In 2D, torque is the z-component of r x F
            torque = r.x * force.y - r.y * force.x
            self._torque += torque

    def apply_force_local(self, force: Vector3, local_point: Optional[Vector3] = None) -> None:
        """Apply force in local coordinates at a local point.

        Args:
            force: Force vector in local (body) coordinates
            local_point: Point of application in local coordinates.
                        If None, force is applied at center of mass.
        """
        # Transform force to world coordinates
        world_force = force.rotate_z(self.orientation)

        if local_point is not None:
            world_point = self.local_to_world(local_point)
        else:
            world_point = None

        self.apply_force(world_force, world_point)

    def apply_torque(self, torque: float) -> None:
        """Apply torque around the Z axis (yaw).

        Args:
            torque: Torque in Newton-meters (positive = counter-clockwise)
        """
        self._torque += torque

    def local_to_world(self, local_point: Vector3) -> Vector3:
        """Transform a point from local (body) to world coordinates."""
        rotated = local_point.rotate_z(self.orientation)
        return self.position + rotated

    def world_to_local(self, world_point: Vector3) -> Vector3:
        """Transform a point from world to local (body) coordinates."""
        relative = world_point - self.position
        return relative.rotate_z(-self.orientation)

    def local_to_world_direction(self, local_dir: Vector3) -> Vector3:
        """Transform a direction from local to world coordinates (no translation)."""
        return local_dir.rotate_z(self.orientation)

    def world_to_local_direction(self, world_dir: Vector3) -> Vector3:
        """Transform a direction from world to local coordinates."""
        return world_dir.rotate_z(-self.orientation)

    def get_velocity_at_point(self, world_point: Vector3) -> Vector3:
        """Get velocity at a world point (includes angular contribution).

        v_point = v_cm + omega x r
        In 2D: v_point = v_cm + omega * (-ry, rx)
        """
        r = world_point - self.position
        # omega cross r in 2D
        angular_contrib = Vector3(
            -self.angular_velocity * r.y,
            self.angular_velocity * r.x,
            0.0
        )
        return self.velocity + angular_contrib

    def get_velocity_at_local_point(self, local_point: Vector3) -> Vector3:
        """Get velocity at a local point."""
        world_point = self.local_to_world(local_point)
        return self.get_velocity_at_point(world_point)

    def get_local_velocity(self) -> Vector3:
        """Get velocity in local (body) coordinates."""
        return self.world_to_local_direction(self.velocity)

    def get_forward_vector(self) -> Vector3:
        """Get unit vector pointing forward (local +X in world)."""
        return Vector3(math.cos(self.orientation), math.sin(self.orientation), 0.0)

    def get_right_vector(self) -> Vector3:
        """Get unit vector pointing right (local +Y in world)."""
        return Vector3(-math.sin(self.orientation), math.cos(self.orientation), 0.0)

    def get_speed(self) -> float:
        """Get speed (magnitude of velocity)."""
        return self.velocity.magnitude()

    def get_forward_speed(self) -> float:
        """Get speed in forward direction (can be negative if reversing)."""
        local_vel = self.get_local_velocity()
        return local_vel.x

    def get_lateral_speed(self) -> float:
        """Get speed in lateral direction (positive = moving right)."""
        local_vel = self.get_local_velocity()
        return local_vel.y

    def get_accumulated_force(self) -> Vector3:
        """Get total accumulated force."""
        return self._force.copy()

    def get_accumulated_torque(self) -> float:
        """Get total accumulated torque."""
        return self._torque

    def clear_forces(self) -> None:
        """Reset force and torque accumulators."""
        self._force = Vector3(0.0, 0.0, 0.0)
        self._torque = 0.0

    def get_acceleration(self) -> Vector3:
        """Calculate linear acceleration from accumulated forces."""
        return self._force / self.mass

    def get_angular_acceleration(self) -> float:
        """Calculate angular acceleration from accumulated torque."""
        return self._torque / self.inertia

    def integrate(self, dt: float) -> None:
        """Integrate state using semi-implicit Euler.

        Updates velocity first, then position with new velocity.
        More stable than explicit Euler for oscillatory systems.
        """
        # Linear
        acceleration = self.get_acceleration()
        self.velocity += acceleration * dt
        self.position += self.velocity * dt

        # Angular
        angular_accel = self.get_angular_acceleration()
        self.angular_velocity += angular_accel * dt
        self.orientation += self.angular_velocity * dt

        # Normalize orientation
        self.orientation = normalize_angle(self.orientation)

        # Clear accumulators
        self.clear_forces()

    def set_state(self, position: Vector3, orientation: float,
                  velocity: Vector3, angular_velocity: float) -> None:
        """Set complete state."""
        self.position = position.copy()
        self.orientation = normalize_angle(orientation)
        self.velocity = velocity.copy()
        self.angular_velocity = angular_velocity

    def reset(self) -> None:
        """Reset to initial state."""
        self.position = Vector3()
        self.orientation = 0.0
        self.velocity = Vector3()
        self.angular_velocity = 0.0
        self.clear_forces()
