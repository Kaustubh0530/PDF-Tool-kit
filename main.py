import io
import os
import json
import time
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter

app = FastAPI(title="PDF Toolkit API")

# Ensure downloads directory exists in workspace
DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to parse page ranges (e.g. "1-3, 5, 7-9")
def parse_page_range(range_str: str, total_pages: int) -> List[int]:
    pages = []
    if not range_str or range_str.strip() == "":
        return list(range(total_pages))
    
    parts = range_str.split(',')
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            try:
                start_str, end_str = part.split('-')
                start = int(start_str.strip()) - 1
                end = int(end_str.strip()) - 1
                # clamp ranges
                start = max(0, min(start, total_pages - 1))
                end = max(0, min(end, total_pages - 1))
                if start <= end:
                    pages.extend(range(start, end + 1))
                else:
                    pages.extend(range(start, end - 1, -1))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid range format: {part}")
        else:
            try:
                val = int(part) - 1
                if 0 <= val < total_pages:
                    pages.append(val)
                else:
                    raise HTTPException(status_code=400, detail=f"Page number out of bounds (1-{total_pages}): {part}")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid page number: {part}")
    return pages

# Endpoint: Merge PDFs
@app.post("/api/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files to merge.")
    
    merger = PdfWriter()
    try:
        for file in files:
            file_bytes = await file.read()
            if not file_bytes:
                continue
            # Read first few bytes to verify it's a PDF
            if not file_bytes.startswith(b"%PDF"):
                raise HTTPException(status_code=400, detail=f"File '{file.filename}' is not a valid PDF.")
            merger.append(io.BytesIO(file_bytes))
        
        output = io.BytesIO()
        merger.write(output)
        merger.close()
        output.seek(0)
        
        file_data = output.getvalue()
        filename = f"merged_{int(time.time())}.pdf"
        local_path = os.path.join(DOWNLOADS_DIR, filename)
        with open(local_path, "wb") as f:
            f.write(file_data)
        abs_path = os.path.abspath(local_path)
        
        headers = {
            "Content-Disposition": "attachment; filename=merged.pdf",
            "X-Saved-Path": abs_path,
            "Access-Control-Expose-Headers": "X-Saved-Path"
        }
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type="application/pdf",
            headers=headers
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error merging PDFs: {str(e)}")

# Endpoint: Split PDF
@app.post("/api/split")
async def split_pdf(
    file: UploadFile = File(...),
    pages: str = Form(...), # Page range string (e.g. "1-3, 5") or JSON list
):
    file_bytes = await file.read()
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file.")
    
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        total_pages = len(reader.pages)
        
        # Determine if pages is a JSON array or a text range string
        try:
            page_indices = json.loads(pages)
            if not isinstance(page_indices, list):
                raise ValueError()
            # Ensure indices are valid
            page_indices = [int(p) for p in page_indices if 0 <= int(p) < total_pages]
        except (json.JSONDecodeError, ValueError):
            page_indices = parse_page_range(pages, total_pages)
            
        if not page_indices:
            raise HTTPException(status_code=400, detail="No valid pages selected for split.")
        
        writer = PdfWriter()
        for idx in page_indices:
            writer.add_page(reader.pages[idx])
            
        output = io.BytesIO()
        writer.write(output)
        output.seek(0)
        
        file_data = output.getvalue()
        filename = f"split_{int(time.time())}.pdf"
        local_path = os.path.join(DOWNLOADS_DIR, filename)
        with open(local_path, "wb") as f:
            f.write(file_data)
        abs_path = os.path.abspath(local_path)
        
        headers = {
            "Content-Disposition": "attachment; filename=split.pdf",
            "X-Saved-Path": abs_path,
            "Access-Control-Expose-Headers": "X-Saved-Path"
        }
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type="application/pdf",
            headers=headers
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error splitting PDF: {str(e)}")

# Endpoint: Compress PDF
@app.post("/api/compress")
async def compress_pdf(
    file: UploadFile = File(...),
    level: str = Form("medium"), # "low", "medium", "high"
):
    file_bytes = await file.read()
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file.")
    
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        writer = PdfWriter()
        
        for page in reader.pages:
            writer.add_page(page)
            
        # Standard Flate compression for content streams
        for page in writer.pages:
            page.compress_content_streams()
            
        output = io.BytesIO()
        writer.write(output)
        output.seek(0)
        
        # Let's verify if size was reduced
        original_size = len(file_bytes)
        compressed_size = len(output.getvalue())
        
        file_data = output.getvalue()
        filename = f"compressed_{int(time.time())}.pdf"
        local_path = os.path.join(DOWNLOADS_DIR, filename)
        with open(local_path, "wb") as f:
            f.write(file_data)
        abs_path = os.path.abspath(local_path)

        # We can add custom headers to return compression stats
        headers = {
            "Content-Disposition": "attachment; filename=compressed.pdf",
            "X-Original-Size": str(original_size),
            "X-Compressed-Size": str(compressed_size),
            "X-Saved-Path": abs_path,
            "Access-Control-Expose-Headers": "X-Original-Size, X-Compressed-Size, X-Saved-Path"
        }
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type="application/pdf",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error compressing PDF: {str(e)}")

# Endpoint: Rotate PDF Pages
@app.post("/api/rotate")
async def rotate_pdf(
    file: UploadFile = File(...),
    rotations: str = Form(...), # JSON object mapping page index to rotation angle, e.g. {"0": 90, "1": 180}
):
    file_bytes = await file.read()
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file.")
    
    try:
        rotation_map = json.loads(rotations)
        reader = PdfReader(io.BytesIO(file_bytes))
        writer = PdfWriter()
        
        for idx in range(len(reader.pages)):
            page = reader.pages[idx]
            idx_str = str(idx)
            if idx_str in rotation_map:
                angle = int(rotation_map[idx_str])
                # Ensure angle is a valid PDF rotation angle
                if angle % 90 == 0:
                    page.rotate(angle)
            writer.add_page(page)
            
        output = io.BytesIO()
        writer.write(output)
        output.seek(0)
        
        file_data = output.getvalue()
        filename = f"rotated_{int(time.time())}.pdf"
        local_path = os.path.join(DOWNLOADS_DIR, filename)
        with open(local_path, "wb") as f:
            f.write(file_data)
        abs_path = os.path.abspath(local_path)
        
        headers = {
            "Content-Disposition": "attachment; filename=rotated.pdf",
            "X-Saved-Path": abs_path,
            "Access-Control-Expose-Headers": "X-Saved-Path"
        }
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type="application/pdf",
            headers=headers
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid rotations JSON map.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rotating PDF: {str(e)}")

# Helper to create reportlab watermark page
def generate_watermark_page(
    width: float, 
    height: float, 
    text: str, 
    font_name: str, 
    font_size: int, 
    color_hex: str, 
    opacity: float, 
    rotation: float, 
    position: str
) -> bytes:
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=(width, height))
    
    can.saveState()
    # Set fill color and opacity
    try:
        color = HexColor(color_hex)
    except:
        color = HexColor("#000000")
        
    can.setFillColor(color)
    can.setFillAlpha(opacity)
    can.setFont(font_name, font_size)
    
    if position == 'center':
        can.translate(width / 2, height / 2)
        can.rotate(rotation)
        can.drawCentredString(0, 0, text)
    elif position == 'top-left':
        can.translate(50, height - 50)
        can.rotate(rotation)
        can.drawString(0, 0, text)
    elif position == 'top-right':
        can.translate(width - 50, height - 50)
        can.rotate(rotation)
        can.drawRightString(0, 0, text)
    elif position == 'bottom-left':
        can.translate(50, 50)
        can.rotate(rotation)
        can.drawString(0, 0, text)
    elif position == 'bottom-right':
        can.translate(width - 50, 50)
        can.rotate(rotation)
        can.drawRightString(0, 0, text)
    elif position == 'tiled':
        # Draw a grid of watermarks
        step_x = 200
        step_y = 200
        # Iterate over coordinates spanning beyond canvas
        for x in range(0, int(width) + step_x, step_x):
            for y in range(0, int(height) + step_y, step_y):
                can.saveState()
                can.translate(x, y)
                can.rotate(rotation)
                can.drawCentredString(0, 0, text)
                can.restoreState()
                
    can.restoreState()
    can.save()
    packet.seek(0)
    return packet.getvalue()

# Endpoint: Add Watermark
@app.post("/api/watermark")
async def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    font: str = Form("Helvetica"), # "Helvetica", "Times-Roman", "Courier"
    size: int = Form(36),
    color: str = Form("#ff0000"), # Hex code
    opacity: float = Form(0.3), # 0.0 to 1.0
    rotation: float = Form(45.0), # degrees
    position: str = Form("center"), # "center", "top-left", "top-right", "bottom-left", "bottom-right", "tiled"
):
    file_bytes = await file.read()
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file.")
    
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        writer = PdfWriter()
        
        # Loop through pages, generate watermark canvas sized specifically to page width/height, merge them
        for page in reader.pages:
            # Get dimensions
            # Page width and height
            width = float(page.mediabox.width)
            height = float(page.mediabox.height)
            
            # Generate watermark overlay PDF for this page size
            watermark_bytes = generate_watermark_page(
                width, height, text, font, size, color, opacity, rotation, position
            )
            
            watermark_reader = PdfReader(io.BytesIO(watermark_bytes))
            watermark_page = watermark_reader.pages[0]
            
            # Merge watermark page onto original page
            # To ensure the watermark overlays on top, we merge the watermark page onto the original page
            page.merge_page(watermark_page)
            writer.add_page(page)
            
        output = io.BytesIO()
        writer.write(output)
        output.seek(0)
        
        file_data = output.getvalue()
        filename = f"watermarked_{int(time.time())}.pdf"
        local_path = os.path.join(DOWNLOADS_DIR, filename)
        with open(local_path, "wb") as f:
            f.write(file_data)
        abs_path = os.path.abspath(local_path)
        
        headers = {
            "Content-Disposition": "attachment; filename=watermarked.pdf",
            "X-Saved-Path": abs_path,
            "Access-Control-Expose-Headers": "X-Saved-Path"
        }
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type="application/pdf",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error watermarking PDF: {str(e)}")

# Mount static files after API endpoints
# If directory "static" doesn't exist, we will create it in a separate step
# But let's check and mount it
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Bind to PORT if set, standard for deployments like Render or Heroku
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
