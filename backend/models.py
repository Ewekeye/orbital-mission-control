from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base

class Satellite(Base):
    __tablename__ = "satellites"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    norad_id = Column(String, unique=True, nullable=False)
    inclination = Column(Float)
    altitude = Column(Float)

    telemetry = relationship("TelemetryLog", back_populates="satellite")
    events = relationship("MissionEvent", back_populates="satellite")
    commands = relationship("Command", back_populates="satellite")


class TelemetryLog(Base):
    __tablename__ = "telemetry_log"

    id = Column(Integer, primary_key=True)
    satellite_id = Column(Integer, ForeignKey("satellites.id"))
    timestamp = Column(DateTime, default=lambda:datetime.now(timezone.utc))
    battery = Column(Float)
    fuel = Column(Float)
    temperature = Column(Float)
    voltage = Column(Float)
    altitude = Column(Float)
    velocity = Column(Float)

    satellite = relationship("Satellite", back_populates="telemetry")


class GroundStation(Base):
    __tablename__ = "ground_stations"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)
    station_type = Column(String)


class MissionEvent(Base):
    __tablename__ = "mission_events"

    id = Column(Integer, primary_key=True)
    satellite_id = Column(Integer, ForeignKey("satellites.id"))
    timestamp = Column(DateTime, default=lambda:datetime.now(timezone.utc))
    level = Column(String)
    message = Column(String)

    satellite = relationship("Satellite", back_populates="events")


class Command(Base):
    __tablename__ = "commands"

    id = Column(Integer, primary_key=True)
    satellite_id = Column(Integer, ForeignKey("satellites.id"))
    name = Column(String, nullable=False)
    status = Column(String, default="PENDING")
    timestamp = Column(DateTime, default=lambda:datetime.now(timezone.utc))

    satellite = relationship("Satellite", back_populates="commands")