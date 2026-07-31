import pytest
from unittest.mock import patch, MagicMock
from app.services.pdf_extractor import extract_text, extract_pdf, extract_docx, extract_pptx

def test_extract_pdf():
    with patch('app.services.pdf_extractor.pdfplumber.open') as mock_open:
        mock_pdf = MagicMock()
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "PDF Text"
        mock_pdf.pages = [mock_page, mock_page]
        
        mock_open.return_value.__enter__.return_value = mock_pdf
        
        result = extract_pdf(b"dummy_bytes")
        assert result == "PDF Text\nPDF Text\n"

def test_extract_docx():
    with patch('app.services.pdf_extractor.docx.Document') as mock_doc_cls:
        mock_doc = MagicMock()
        p1 = MagicMock()
        p1.text = "Para 1"
        p2 = MagicMock()
        p2.text = "Para 2"
        mock_doc.paragraphs = [p1, p2]
        mock_doc_cls.return_value = mock_doc
        
        result = extract_docx(b"dummy_bytes")
        assert result == "Para 1\nPara 2"

def test_extract_pptx():
    with patch('app.services.pdf_extractor.pptx.Presentation') as mock_ppt_cls:
        mock_ppt = MagicMock()
        slide = MagicMock()
        shape = MagicMock()
        shape.text = "Slide Text"
        slide.shapes = [shape]
        mock_ppt.slides = [slide]
        mock_ppt_cls.return_value = mock_ppt
        
        result = extract_pptx(b"dummy_bytes")
        assert result == "Slide Text\n"

def test_extract_text_routing():
    with patch('app.services.pdf_extractor.extract_pdf') as mock_pdf:
        mock_pdf.return_value = "pdf text"
        assert extract_text("pdf", b"123") == "pdf text"
        
    with patch('app.services.pdf_extractor.extract_docx') as mock_docx:
        mock_docx.return_value = "docx text"
        assert extract_text("docx", b"123") == "docx text"
        
    with patch('app.services.pdf_extractor.extract_pptx') as mock_pptx:
        mock_pptx.return_value = "pptx text"
        assert extract_text("pptx", b"123") == "pptx text"
        
    with pytest.raises(ValueError, match="Unsupported file type"):
        extract_text("txt", b"123")
