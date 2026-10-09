from fastapi import FastAPI, APIRouter

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}
