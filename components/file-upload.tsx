'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, File, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface FileUploadProps {
    label: string
    accept?: Record<string, string[]>
    onFileSelect: (file: File | null) => void
    className?: string
}

export function FileUpload({ label, accept, onFileSelect, className }: FileUploadProps) {
    const [file, setFile] = useState<File | null>(null)

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const selectedFile = acceptedFiles[0]
            setFile(selectedFile)
            onFileSelect(selectedFile)
        }
    }, [onFileSelect])

    const removeFile = () => {
        setFile(null)
        onFileSelect(null)
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept,
        maxFiles: 1,
    })

    return (
        <div className={cn('w-full', className)}>
            <p className="mb-2 text-sm font-medium text-foreground">{label}</p>

            {!file ? (
                <div
                    {...getRootProps()}
                    className={cn(
                        'border-2 border-dashed rounded-xl p-8 transition-colors flex flex-col items-center justify-center text-center cursor-pointer',
                        isDragActive
                            ? 'border-primary bg-primary/5'
                            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                    )}
                >
                    <input {...getInputProps()} />
                    <CloudUpload className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="text-sm text-foreground font-medium">
                        {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra y suelta o haz clic para seleccionar'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Soporta {accept ? Object.keys(accept).join(', ').replace(/application\/|image\//g, '') : 'todos los archivos'}
                    </p>
                </div>
            ) : (
                <div className="relative border rounded-xl p-4 flex items-center gap-4 bg-card">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <File className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={removeFile}
                        className="text-muted-foreground hover:text-destructive"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
