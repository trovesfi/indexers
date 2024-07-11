#!/bin/bash
# Solves this error
# https://stackoverflow.com/questions/72513993/how-to-install-glibc-2-29-or-higher-in-ubuntu-18-04
# Check GLIBC_2.29
echo "ldd version"
ldd --version | head -n1

# Build GLIBC_2.29 from sources
echo "updating"
sudo apt-get update
echo "installing gawk bison"
sudo apt-get install gawk bison -y
echo "installing glibc"
wget -c https://ftp.gnu.org/gnu/glibc/glibc-2.39.tar.gz
tar -zxvf glibc-2.39.tar.gz && cd glibc-2.39
mkdir glibc-build && cd glibc-build
echo "configuring"
../configure --prefix=/opt/glibc-2.39
echo "making"
make 
echo "installing glibc"
make install

# # Install apibara
# curl -sL https://install.apibara.com | bash
# apibara --version
# apibara plugins install sink-postgres
# apibara plugins list
