export interface ISourceCodeItem {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
}
export interface ISourceCodeResponse {
  status: string; // '1' or '0'
  message: string; // 'OK', 'NOTOK'
  result: ISourceCodeItem[];
}
