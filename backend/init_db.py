import sys
import os
sys.path.append(os.path.dirname(__file__))

from database import engine, Base
import models

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Done!")
