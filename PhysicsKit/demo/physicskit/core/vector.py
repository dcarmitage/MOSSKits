"""Vector mathematics for 2D/3D physics simulation."""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Union

import numpy as np


@dataclass
class Vector3:
    """3D vector with common operations for physics simulation.

    For 2D top-down simulation, z is typically 0 (ground plane is XY).
    """
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    @classmethod
    def from_array(cls, arr: np.ndarray) -> Vector3:
        """Create Vector3 from numpy array."""
        return cls(float(arr[0]), float(arr[1]), float(arr[2]) if len(arr) > 2 else 0.0)

    @classmethod
    def from_angle(cls, angle: float, magnitude: float = 1.0) -> Vector3:
        """Create Vector3 from angle (radians) in XY plane."""
        return cls(math.cos(angle) * magnitude, math.sin(angle) * magnitude, 0.0)

    def to_array(self) -> np.ndarray:
        """Convert to numpy array."""
        return np.array([self.x, self.y, self.z])

    def magnitude(self) -> float:
        """Return the length of the vector."""
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    def magnitude_squared(self) -> float:
        """Return the squared length (faster, no sqrt)."""
        return self.x * self.x + self.y * self.y + self.z * self.z

    def magnitude_2d(self) -> float:
        """Return length in XY plane only."""
        return math.sqrt(self.x * self.x + self.y * self.y)

    def normalized(self) -> Vector3:
        """Return unit vector in same direction."""
        mag = self.magnitude()
        if mag < 1e-10:
            return Vector3(0.0, 0.0, 0.0)
        return Vector3(self.x / mag, self.y / mag, self.z / mag)

    def dot(self, other: Vector3) -> float:
        """Dot product with another vector."""
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: Vector3) -> Vector3:
        """Cross product with another vector."""
        return Vector3(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x
        )

    def rotate_z(self, angle: float) -> Vector3:
        """Rotate vector around Z axis by angle (radians)."""
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        return Vector3(
            self.x * cos_a - self.y * sin_a,
            self.x * sin_a + self.y * cos_a,
            self.z
        )

    def angle_2d(self) -> float:
        """Return angle of vector in XY plane (radians)."""
        return math.atan2(self.y, self.x)

    def project_onto(self, other: Vector3) -> Vector3:
        """Project this vector onto another vector."""
        other_mag_sq = other.magnitude_squared()
        if other_mag_sq < 1e-10:
            return Vector3(0.0, 0.0, 0.0)
        scalar = self.dot(other) / other_mag_sq
        return other * scalar

    def perpendicular_2d(self) -> Vector3:
        """Return perpendicular vector in XY plane (90 degrees CCW)."""
        return Vector3(-self.y, self.x, 0.0)

    def lerp(self, other: Vector3, t: float) -> Vector3:
        """Linear interpolation between this and other vector."""
        return Vector3(
            self.x + (other.x - self.x) * t,
            self.y + (other.y - self.y) * t,
            self.z + (other.z - self.z) * t
        )

    def copy(self) -> Vector3:
        """Return a copy of this vector."""
        return Vector3(self.x, self.y, self.z)

    # Operator overloads
    def __add__(self, other: Vector3) -> Vector3:
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: Vector3) -> Vector3:
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float) -> Vector3:
        return Vector3(self.x * scalar, self.y * scalar, self.z * scalar)

    def __rmul__(self, scalar: float) -> Vector3:
        return self.__mul__(scalar)

    def __truediv__(self, scalar: float) -> Vector3:
        return Vector3(self.x / scalar, self.y / scalar, self.z / scalar)

    def __neg__(self) -> Vector3:
        return Vector3(-self.x, -self.y, -self.z)

    def __iadd__(self, other: Vector3) -> Vector3:
        self.x += other.x
        self.y += other.y
        self.z += other.z
        return self

    def __isub__(self, other: Vector3) -> Vector3:
        self.x -= other.x
        self.y -= other.y
        self.z -= other.z
        return self

    def __imul__(self, scalar: float) -> Vector3:
        self.x *= scalar
        self.y *= scalar
        self.z *= scalar
        return self

    def __repr__(self) -> str:
        return f"Vector3({self.x:.4f}, {self.y:.4f}, {self.z:.4f})"


def normalize_angle(angle: float) -> float:
    """Normalize angle to [-pi, pi] range."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle


def angle_difference(a: float, b: float) -> float:
    """Calculate shortest angular difference between two angles."""
    diff = normalize_angle(a - b)
    return diff


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value to range [min_val, max_val]."""
    return max(min_val, min(max_val, value))


def lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation between a and b."""
    return a + (b - a) * t


def sign(x: float) -> float:
    """Return sign of x (-1, 0, or 1)."""
    if x > 0:
        return 1.0
    elif x < 0:
        return -1.0
    return 0.0
