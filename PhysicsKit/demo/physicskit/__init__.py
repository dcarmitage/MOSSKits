"""
PhysicsKit - Multi-body physics simulation with non-linear tire physics for car drifting.

A MOSS Kit for realistic vehicle dynamics simulation featuring:
- Pacejka Magic Formula tire model
- Combined slip handling with friction ellipse
- 4-wheel vehicle dynamics with weight transfer
- Drift angle calculation and scoring
"""

__version__ = "0.1.0"

from physicskit.core.vector import Vector3
from physicskit.core.rigid_body import RigidBody
from physicskit.core.world import World

__all__ = [
    "Vector3",
    "RigidBody",
    "World",
    "__version__",
]
