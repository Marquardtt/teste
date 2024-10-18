import { useContext, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.entry";
import { FileP } from "@/models";
import { animate, motion } from "framer-motion";
import BrushIcon from '@mui/icons-material/Brush';
import { rgb, PDFDocument, LineCapStyle, drawLine, ColorTypes } from "pdf-lib";
import { FilesContext } from "@/contexts/FilesContext";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PDFEditProps {
    file: FileP;
    pageNumber: number;
    closeModal: (a:any) => void;
}

export const PDFEditComponent = ({ file, pageNumber: initialPageNumber, closeModal }: PDFEditProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const [pdf, setPdf] = useState<any>(null);
    const [pageNumber, setPageNumber] = useState(initialPageNumber);
    const [zoomLevel, setZoomLevel] = useState(1);
    const renderTaskRef = useRef<any>(null);
    const [colorSelected, setColorSelected] = useState("#FFFFFF");
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [colorPicker, setColorPicker] = useState("#FFFFFF");
    const [isDrawing, setIsDrawing] = useState(false);
    const [mode, setMode] = useState<'draw' | 'erase' | 'view'>('view');
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [inputRange, setInputRange] = useState(false);
    const { files, setFiles } = useContext(FilesContext);
    const [colorSize, setColorSize] = useState<number | string>(2);
    const [drawings, setDrawings] = useState<any[]>([]);

    useEffect(() => {
        const loadPDF = async () => {
            const loadingTask = pdfjsLib.getDocument(file.url);
            const loadedPDF = await loadingTask.promise;
            setPdf(loadedPDF);
        };
        loadPDF();
    }, [file]);

    const renderPdf = async (pageNumber: number, zoom: number) => {
        if (!canvasRef.current || !pdf) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: zoom });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport,
        };

        if (renderTaskRef.current) {
            await renderTaskRef.current.promise;
        }

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
        renderTaskRef.current = null;

        if (drawingCanvasRef.current) {
            const drawingCanvas = drawingCanvasRef.current;
            drawingCanvas.height = viewport.height;
            drawingCanvas.width = viewport.width;
        }
    };

    useEffect(() => {
        if (pdf) {
            renderPdf(pageNumber, zoomLevel);
        }
    }, [pdf, pageNumber, zoomLevel]);

    const handlePageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPage = parseInt(e.target.value);
        if (newPage > 0 && newPage <= pdf?.numPages) {
            setPageNumber(newPage);
        }
    };

    const zoomIn = () => {
        setZoomLevel((prevZoom) => Math.min(prevZoom + 0.1, 3));
    };

    const zoomOut = () => {
        setZoomLevel((prevZoom) => Math.max(prevZoom - 0.1, 0.5));
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvasDrawing = drawingCanvasRef.current;
        const rect = canvasDrawing?.getBoundingClientRect();
        setMousePos({
            x: e.clientX - (rect?.left ?? 0),
            y: e.clientY - (rect?.top ?? 0),
        });
        if (mode === 'draw' || mode === 'erase') {
            setIsDrawing(true);
        }
    };

    const distanceToLine = (lineStart: { x: number; y: number }, lineEnd: { x: number; y: number }, point: { x: number; y: number }) => {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        const param = (len_sq !== 0) ? (dot / len_sq) : -1;

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawingCanvasRef.current) return;

        const canvasDrawing = drawingCanvasRef.current;
        const rect = canvasDrawing.getBoundingClientRect();

        const newMousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        if (mode === "draw") {
            const newDrawing = {
                type: 'line',
                color: colorSelected,
                lineWidth: colorSize as number,
                from: { ...mousePos },
                to: { ...newMousePos }
            };
            setDrawings((prev) => [...prev, newDrawing]);
        } else if (mode === "erase") {
            const eraseRadius = (colorSize as number) * 2;
            setDrawings((prev) => {
                return prev.filter(drawing => {
                    if (drawing.type === 'line') {
                        const distFromStart = distanceToLine(drawing.from, drawing.to, newMousePos);
                        return distFromStart > eraseRadius;
                    }
                    return true;
                });
            });
        }

        setMousePos(newMousePos);
        renderDrawings();
    };

    const renderDrawings = () => {
        if (!drawingCanvasRef.current) return;

        const canvasDrawing = drawingCanvasRef.current;
        const context = canvasDrawing.getContext("2d");
        if (context) {
            context.clearRect(0, 0, canvasDrawing.width, canvasDrawing.height);
            drawings.forEach((drawing) => {
                context.beginPath();
                context.lineWidth = drawing.lineWidth;
                context.strokeStyle = drawing.color;
                context.lineCap = 'round';
                context.moveTo(drawing.from.x, drawing.from.y);
                context.lineTo(drawing.to.x, drawing.to.y);
                context.stroke();
            });
        }
    };

    const save = async () => {
        const pdfDoc = await PDFDocument.create();
        const originalPdfBytes = await fetch(file.url).then((res) => res.arrayBuffer());
        const originalPdf = await PDFDocument.load(originalPdfBytes);

        const [originalPage] = await pdfDoc.copyPages(originalPdf, [pageNumber - 1]);
        pdfDoc.addPage(originalPage);

        const page = pdfDoc.getPages()[0];
        const { height } = originalPage.getSize();

        const drawColor = (color: string) => {
            return rgb(
                parseInt(color.slice(1, 3), 16) / 255,
                parseInt(color.slice(3, 5), 16) / 255,
                parseInt(color.slice(5, 7), 16) / 255
            );
        };

        drawings.forEach((drawing) => {
            const startY = height - drawing.from.y;
            const endY = height - drawing.to.y;

            if (drawing.type === 'line') {
                page.drawLine({
                    start: { x: drawing.from.x, y: startY },
                    end: { x: drawing.to.x, y: endY },
                    lineCap: LineCapStyle.Round,
                    color: drawColor(drawing.color),
                    thickness: Number(drawing.lineWidth),
                    opacity: 1,
                });
            } else if (drawing.type === 'erase') {
                page.drawLine({
                    start: { x: drawing.from.x, y: startY },
                    end: { x: drawing.to.x, y: endY },
                    lineCap: LineCapStyle.Round,
                    thickness: Number(drawing.lineWidth),
                    color: rgb(1, 1, 1), 
                    opacity: 0.5, 
                });
            }
        });


        const pdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
        const fileP = new File([pdfBlob], file.name);
        const newFileP = new FileP(
            URL.createObjectURL(fileP),
            fileP.name,
            fileP.size,
            fileP.type,
            fileP.lastModified,
            fileP.webkitRelativePath,
            fileP.slice.bind(fileP),
            fileP.stream.bind(fileP),
            fileP.text.bind(fileP),
            fileP.arrayBuffer.bind(fileP)
        );

        if (setFiles && files) {
            const newFiles = [...files];
            newFiles.splice(newFiles.indexOf(file), 1, newFileP);
            setFiles(newFiles);
        }
    }

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const toggleMode = (newMode: 'draw' | 'erase' | 'view') => {
        setMode(newMode);
    };

    return (
        <div className="md:w-[90vw] md:h-[50vw] lg:h-[94%] lg:w-1/1 bg-gray-400 dark:bg-slate-600 rounded-md flex flex-col items-center justify-end text-white">
            <div className="flex items-center gap-4 my-2 w-full h-12 px-3 justify-between">
                <div className="flex gap-3">
                    <div className="flex justify-center items-center w-9 h-9 rounded-full bg-primary">
                        <i className="pi pi-book" style={{ color: "white" }}></i>
                    </div>
                    <div
                        className="relative"
                        onMouseOver={() => setColorPickerOpen(true)}
                        onMouseOut={() => setColorPickerOpen(false)}
                    >
                        <div
                            className={`relative flex flex-col justify-center bg-primary dark:bg-slate-600 rounded-md  w-44 h-9  items-start z-40 `}>
                            <div className="w-full flex items-center justify-between gap-3 px-3" onClick={() => toggleMode('draw')}>
                                <div
                                    className="flex gap-2 items-center cursor-pointer">
                                    <i className="pi pi-pencil" style={{ color: "white" }}></i>
                                    <span>Desenhar</span>
                                </div>
                                <div className="flex items-center">
                                    <motion.i
                                        className="w-fit h-fit pi pi-angle-up"
                                        animate={{ rotate: colorPickerOpen ? 180 : 0 }}>
                                    </motion.i>
                                </div>
                            </div>
                        </div>
                        {colorPickerOpen && (
                            <>
                                <motion.div
                                    className="absolute w-full z-40"
                                    initial={{ y: -20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -20, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className="h-2 bg-transparent"></div>
                                    <motion.div className="bg-primary w-full rounded-md py-2 flex flex-col gap-3">
                                        <div className="flex gap-3 justify-center">
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#7DDA58"), setColorPicker("#000000"))}
                                                className={`bg-[#7DDA58] cursor-pointer w-7 h-7 rounded-full`}
                                            />
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#D20103"), setColorPicker("#000000"))}
                                                className={`bg-[#D20103] cursor-pointer w-7 h-7 rounded-full`}
                                            />
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#000000"), setColorPicker("#000000"))}
                                                className={`bg-[#000000] cursor-pointer w-7 h-7 rounded-full`}
                                            />
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#FFFFFF"), setColorPicker("#000000"))}
                                                className={`bg-[#FFFFFF] cursor-pointer w-7 h-7 rounded-full`}
                                            />
                                        </div>
                                        <div className="flex gap-3 justify-center">
                                            <div className="bg-white w-7 h-7 rounded-full relative">
                                                <motion.input
                                                    style={{ position: "absolute", opacity: 0 }}
                                                    id="colorPicker"
                                                    type="color"
                                                    whileTap={{ scale: 0.9 }}
                                                    onChange={(e) => (setColorSelected(e.currentTarget.value), setColorPicker(e.currentTarget.value))}
                                                >
                                                </motion.input>
                                                <label className="flex justify-center items-center" htmlFor="colorPicker">
                                                    <BrushIcon sx={{ color: colorPicker, fontSize: 20 }}></BrushIcon>
                                                </label>
                                            </div>
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#D20103"), setColorPicker("#000000"))}
                                                className={`bg-[#D20103] cursor-pointer w-7 h-7 rounded-full`}>
                                            </motion.div>
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#000000"), setColorPicker("#000000"))}
                                                className={`bg-[#000000] cursor-pointer w-7 h-7 rounded-full`}>
                                            </motion.div>
                                            <motion.div
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => (setColorSelected("#FFFFFF"), setColorPicker("#000000"))}
                                                className={`bg-[#FFFFFF] cursor-pointer w-7 h-7 rounded-full`}>
                                            </motion.div>
                                        </div>
                                        <div className="flex gap-3 justify-center">

                                            <svg
                                                style={{ display: "block", margin: "0 auto", transform: "scale(0.8)" }}
                                                width="200"
                                                height="40"
                                                viewBox="0 0 150 40"
                                                preserveAspectRatio="xMidYMid meet"
                                            >
                                                <path

                                                    d="M0,20 Q25,0 50,20 T100,20 T150,20"
                                                    stroke-linecap="round"
                                                    stroke={colorSelected}
                                                    strokeWidth={colorSize}
                                                    fill="transparent"
                                                />
                                            </svg>

                                        </div>
                                        <div className="flex gap-3 justify-center">
                                            <motion.input step={2} min={4} max={20} className={`${inputRange ? "" : ""}`} onChange={(e) => setColorSize(e.currentTarget.value)} value={colorSize} type="range" name="" id="" />
                                        </div>
                                    </motion.div>
                                </motion.div>
                            </>
                        )}
                    </div>
                    <motion.div
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.1, rotate: 1 }}
                        className={`bg-primary dark:bg-slate-600 w-9 h-9 rounded-full flex justify-center items-center cursor-pointer ${mode === 'erase' ? 'active' : ''}`}
                        onClick={() => (toggleMode('erase'), setColorSelected('rgba(255, 255, 255, 1)'))}
                    >
                        <i className="pi pi-eraser" style={{ color: "white" }}></i>
                    </motion.div>
                </div>
                <div>
                    <div className="flex gap-4 py-2">
                        <div className="flex gap-2">
                            <motion.div
                                whileTap={{ scale: 0.9 }}
                                whileHover={{ scale: 1.1, rotate: 1 }}
                                className={`bg-primary dark:bg-slate-600 w-9 h-9 rounded-full flex justify-center items-center cursor-pointer ${mode === 'erase' ? 'active' : ''}`}
                                onClick={zoomOut}
                            >
                                <i className="pi pi-minus" style={{ color: "white" }}></i>
                            </motion.div>
                            <motion.div
                                whileTap={{ scale: 0.9 }}
                                whileHover={{ scale: 1.1, rotate: 1 }}
                                className={`bg-primary dark:bg-slate-600 w-9 h-9 rounded-full flex justify-center items-center cursor-pointer ${mode === 'erase' ? 'active' : ''}`}
                                onClick={zoomIn}
                            >
                                <i className="pi pi-plus" style={{ color: "white" }}></i>
                            </motion.div>
                        </div>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                value={pageNumber}
                                onChange={handlePageChange}
                                className="border rounded px-2"
                                min={1}
                            />
                            <div>
                                <span> de {pdf?.numPages}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-center items-center gap-3">
                    <button onClick={save}>save</button>
                    <div className="flex justify-end w-full">
                        <i className="pi pi-times cursor-pointer" style={{ color: "white" }} onClick={closeModal}></i>
                    </div>
                </div>
            </div >
            <div className="relative flex flex-col items-center justify-center bg-gray-300 dark:bg-gray-500 w-full h-full">
                {file.url != null ? (
                    <>
                        <div className="relative flex justify-center items-center w-full h-full overflow-auto">
                            <canvas ref={canvasRef} className="absolute z-10"></canvas>
                            <canvas
                                ref={drawingCanvasRef}
                                className="absolute z-20"
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                            />
                        </div>
                    </>
                )
                    :
                    ("Visualização indisponível")
                }
            </div >
        </div >
    );
}



