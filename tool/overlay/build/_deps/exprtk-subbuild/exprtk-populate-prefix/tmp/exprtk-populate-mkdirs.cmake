# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file LICENSE.rst or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION ${CMAKE_VERSION}) # this file comes with cmake

# If CMAKE_DISABLE_SOURCE_CHANGES is set to true and the source directory is an
# existing directory in our source tree, calling file(MAKE_DIRECTORY) on it
# would cause a fatal error, even though it would be a no-op.
if(NOT EXISTS "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-src")
  file(MAKE_DIRECTORY "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-src")
endif()
file(MAKE_DIRECTORY
  "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-build"
  "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix"
  "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix/tmp"
  "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix/src/exprtk-populate-stamp"
  "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix/src"
  "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix/src/exprtk-populate-stamp"
)

set(configSubDirs Debug)
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix/src/exprtk-populate-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "D:/FH6-HorizonTuner/tool/overlay/build/_deps/exprtk-subbuild/exprtk-populate-prefix/src/exprtk-populate-stamp${cfgdir}") # cfgdir has leading slash
endif()
