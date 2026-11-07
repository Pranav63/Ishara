from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .places import PLACES

Domain = Literal["medical", "legal", "government", "education", "other"]
RequestStatus = Literal["parsing", "reviewing", "dispatching", "confirmed", "replanning", "escalated", "completed"]


class ArchiveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    archived: bool = Field(strict=True)


class Appointment(BaseModel):
    entity: str
    area: str
    starts_at: float  # epoch seconds
    duration_min: int = 45
    domain: Domain = "other"
    language: str = "UAE Sign Language"
    notes: str = ""
    assumed: list = Field(default_factory=list)  # fields the agent had to guess
    source: Literal["llm", "rules"] = "rules"


class RequestIn(BaseModel):
    text: str = Field(min_length=8, max_length=4000)
    requester_name: str = Field(default="", max_length=60)


class CompleteIn(BaseModel):
    notes: str = Field(default="", max_length=2000)


class ArrivalIn(BaseModel):
    minutes: int = Field(ge=0, le=240, strict=True)


class ApprovalIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    entity: str = Field(min_length=2, max_length=120)
    area: str
    starts_at: float = Field(gt=0, allow_inf_nan=False)
    duration_min: int = Field(ge=5, le=480, strict=True)
    domain: Domain
    language: Literal["UAE Sign Language", "ASL", "International Sign"]

    @field_validator("area")
    @classmethod
    def known_area(cls, value: str) -> str:
        if value not in PLACES:
            raise ValueError("Choose a supported Dubai area.")
        return value


class OperatorLoginIn(BaseModel):
    key: str = Field(min_length=1, max_length=4096)


class AcknowledgeIn(BaseModel):
    note: str = Field(default="", max_length=1000)
