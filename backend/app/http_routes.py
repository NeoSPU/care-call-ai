from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResourceRoute:
    prefix: str

    def match(self, path: str) -> str | None:
        return resource_id(path, self.prefix)


@dataclass(frozen=True)
class NestedResourceRoute:
    prefix: str
    suffix: str

    def match(self, path: str) -> str | None:
        return nested_resource_id(path, self.prefix, self.suffix)


def resource_id(path: str, prefix: str) -> str | None:
    if not path.startswith(prefix):
        return None
    value = path.removeprefix(prefix).strip("/")
    return value or None


def nested_resource_id(path: str, prefix: str, suffix: str) -> str | None:
    if not path.startswith(prefix) or not path.endswith(suffix):
        return None
    value = path.removeprefix(prefix).removesuffix(suffix).strip("/")
    return value or None
