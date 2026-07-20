'use client'

import React from 'react';
import { CheckCircle, CloudUpload } from 'lucide-react';

interface FileCardProps {
    title: string;
    file: File | null;
    count: number;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    color: string;
    icon: React.ElementType;
}

export const FileCard: React.FC<FileCardProps> = ({ title, file, count, onFileSelect, color, icon: Icon }) => (
    <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 ${color} transition-all hover:shadow-md`}>
        <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color.replace('border-', 'bg-').replace('500', '100')} ${color.replace('border-', 'text-').replace('500', '700')}`}>
                    <Icon size={24} />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800">{title}</h3>
                    <p className="text-xs text-gray-500">Formato .xlsx o .csv</p>
                </div>
            </div>
            {file && <CheckCircle className="text-green-500" size={20} />}
        </div>

        <label className="block w-full group cursor-pointer">
            <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${file ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}>
                <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onFileSelect} />
                {file ? (
                    <span className="text-sm text-gray-600 group-hover:text-blue-600 font-medium truncate block">
                        {file.name}
                    </span>
                ) : (
                    <div className="flex flex-col items-center gap-1">
                        <CloudUpload className="h-8 w-8 text-gray-400 group-hover:text-blue-500" />
                        <span className="text-sm text-gray-500 group-hover:text-blue-600">Seleccionar archivo</span>
                    </div>
                )}
            </div>
        </label>

        {count > 0 && (
            <div className="mt-3 flex justify-between items-center text-sm">
                <span className="text-gray-500">Registros leídos:</span>
                <span className="font-bold text-gray-800">{count}</span>
            </div>
        )}
    </div>
);
