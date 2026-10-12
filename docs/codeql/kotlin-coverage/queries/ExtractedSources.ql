/**
 * Source extraction evidence, deliberately separate from the security query suite.
 * A File or source archive entry alone is not evidence of extraction.
 */
import java

from File file, string language, string status
where
  (
    exists(CompilationUnit unit |
      file = unit and unit.fromSource() and
      file.getAbsolutePath().matches("%.java")
    ) and
    language = "java" and status = "compilation_unit"
  )
  or
  (
    exists(Compilation compilation, int index |
      compilation.isKotlin() and file = compilation.getFileCompiled(index) and
      (
        compilation.fileCompiledSuccessful(index) and status = "successful"
        or
        compilation.fileCompiledRecoverableErrors(index) and status = "recoverable_errors"
        or
        compilation.fileCompiledNonRecoverableErrors(index) and status = "nonrecoverable_errors"
        or
        not compilation.fileCompiledSuccessful(index) and
        not compilation.fileCompiledRecoverableErrors(index) and
        not compilation.fileCompiledNonRecoverableErrors(index) and status = "incomplete"
      )
    ) and
    language = "kotlin"
  )
select language, file.getAbsolutePath() as path, status
