import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdf } from "../services/pdf";

const drawStroke = (context, stroke, width, height) => {
  if (!stroke?.points?.length) {
    return;
  }

  context.save();
  context.beginPath();
  context.globalAlpha = stroke.tool === "highlighter" ? 0.3 : 1;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.tool === "highlighter" ? 18 : 4;
  context.strokeStyle = stroke.color;
  context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);

  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x * width, point.y * height);
  }

  context.stroke();
  context.restore();
};

function PresentationViewer({
  presentation,
  canAnnotate = false,
  tool = "pen",
  color = "#ef4444",
  zoom = 1,
  onPageCount,
  onStroke,
}) {
  const containerRef = useRef();
  const pdfCanvasRef = useRef();
  const annotationCanvasRef = useRef();
  const pdfRef = useRef();
  const renderTaskRef = useRef();
  const activeStrokeRef = useRef();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [loadResult, setLoadResult] = useState({ data: "", error: "" });

  useEffect(() => {
    let isActive = true;

    if (!presentation.data) {
      pdfRef.current = undefined;
      return undefined;
    }

    loadPdf(presentation.data)
      .then((pdf) => {
        if (!isActive) {
          return;
        }

        pdfRef.current = pdf;
        setLoadResult({ data: presentation.data, error: "" });
        onPageCount?.(pdf.numPages);
      })
      .catch(() => {
        if (isActive) {
          setLoadResult({
            data: presentation.data,
            error: "Unable to load this PDF",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [presentation.data, onPageCount]);

  const status = !presentation.data
    ? "Waiting for the teacher to upload a PDF"
    : loadResult.data !== presentation.data
      ? "Loading presentation..."
      : loadResult.error;

  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current;
    const canvas = pdfCanvasRef.current;
    const container = containerRef.current;

    if (!pdf || !canvas || !container) {
      return;
    }

    const page = await pdf.getPage(presentation.page);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(container.clientWidth - 24, 280);
    const availableHeight = Math.max(container.clientHeight - 24, 160);
    const scale = Math.min(
      availableWidth / baseViewport.width,
      availableHeight / baseViewport.height,
      2,
    ) * zoom;
    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);

    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const context = canvas.getContext("2d");
    renderTaskRef.current?.cancel();
    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform:
        pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;

      if (renderTaskRef.current === renderTask) {
        setCanvasSize({ width: viewport.width, height: viewport.height });
      }
    } catch (error) {
      if (error?.name !== "RenderingCancelledException") {
        throw error;
      }
    }
  }, [presentation.page, zoom]);

  useEffect(() => {
    const container = containerRef.current;
    let frameId;
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        renderPage().catch(() => undefined);
      });
    });

    if (container) {
      resizeObserver.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderTaskRef.current?.cancel();
    };
  }, [presentation.data, presentation.page, renderPage, status]);

  useEffect(() => {
    const canvas = annotationCanvasRef.current;

    if (!canvas || !canvasSize.width) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.floor(canvasSize.width * pixelRatio);
    canvas.height = Math.floor(canvasSize.height * pixelRatio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const context = canvas.getContext("2d");
    context.scale(pixelRatio, pixelRatio);

    for (const stroke of presentation.strokes.filter(
      (item) => item.page === presentation.page,
    )) {
      drawStroke(context, stroke, canvasSize.width, canvasSize.height);
    }
  }, [canvasSize, presentation.page, presentation.strokes]);

  const getPoint = (event) => {
    const bounds = annotationCanvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1),
      y: Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1),
    };
  };

  const handlePointerDown = (event) => {
    if (!canAnnotate) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = {
      page: presentation.page,
      tool,
      color,
      points: [getPoint(event)],
    };
  };

  const handlePointerMove = (event) => {
    const stroke = activeStrokeRef.current;

    if (!stroke) {
      return;
    }

    const nextPoint = getPoint(event);
    const previousPoint = stroke.points.at(-1);
    stroke.points.push(nextPoint);

    const context = annotationCanvasRef.current.getContext("2d");
    drawStroke(
      context,
      { ...stroke, points: [previousPoint, nextPoint] },
      canvasSize.width,
      canvasSize.height,
    );
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = undefined;

    if (stroke?.points.length > 1) {
      onStroke?.(stroke);
    }
  };

  if (!presentation.data || status) {
    return <div className="presentation-empty">{status}</div>;
  }

  return (
    <div className="presentation-stage" ref={containerRef}>
      <div className="presentation-canvas-stack">
        <canvas ref={pdfCanvasRef} />
        <canvas
          className={canAnnotate ? "annotation-canvas drawing" : "annotation-canvas"}
          ref={annotationCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>
    </div>
  );
}

export default PresentationViewer;
